import {
  COPY_SOURCE,
  createDialog,
  lastCopySelection,
  next,
  openCopyWizard,
  rowSwitch,
  seedCopySource,
} from "./support/copy-agent";
import { expect, test } from "./support/fixtures";
import { rail } from "./support/team-nav";

/**
 * "Copy an agent": the create dialog's third door. Pick one of your agents,
 * then decide, item by item, what the new agent keeps: job description and
 * learnings, routines, skills, everything ON to start. The copy is the
 * portable pipeline (preview, package, install) fed that selection, so the
 * fake host records what the package carried and the spec asserts it.
 */
test("copies an agent, leaving chosen items behind", async ({
  page,
  request,
}) => {
  const { routineId } = await seedCopySource(request);
  await page.goto("/");

  await page.getByRole("button", { name: "New agent" }).click();
  await openCopyWizard(page);

  // The seeded agent is the one source; picking it reads its content and
  // moves on to the first content screen by itself.
  const dialog = createDialog(page);
  await dialog.getByRole("button", { name: "Houston", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "What should the copy know?" }),
  ).toBeVisible();

  // Job description and both learnings, all on. Leave one learning behind.
  await expect(rowSwitch(page, "Job description and rules")).toBeChecked();
  await expect(dialog.getByText(COPY_SOURCE.instructions)).toBeVisible();
  for (const text of COPY_SOURCE.learnings) {
    await expect(rowSwitch(page, text)).toBeChecked();
  }
  await rowSwitch(page, COPY_SOURCE.learnings[1]).click();
  await expect(rowSwitch(page, COPY_SOURCE.learnings[1])).not.toBeChecked();
  await next(page);

  // Routines, then skills. Keep the routine, drop the skill with "Clear".
  await expect(
    dialog.getByRole("heading", { name: "Which routines should come along?" }),
  ).toBeVisible();
  await expect(rowSwitch(page, COPY_SOURCE.routine.name)).toBeChecked();
  await next(page);
  await expect(
    dialog.getByRole("heading", { name: "Which skills should come along?" }),
  ).toBeVisible();
  await expect(rowSwitch(page, "Invoice Triage")).toBeChecked();
  await dialog.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(rowSwitch(page, "Invoice Triage")).not.toBeChecked();
  await next(page);

  // The naming screen is the create dialog's own, pre-filled with the first
  // free "<name> copy" and headed by the source.
  await expect(dialog.getByText("Based on Houston")).toBeVisible();
  const nameField = dialog.getByPlaceholder(
    "e.g. Product manager, Sales, Jerry",
  );
  await expect(nameField).toHaveValue("Houston copy");
  await dialog.getByRole("button", { name: "Create Agent" }).click();

  // The copy lands in the rail and the dialog is gone.
  await expect(
    rail(page).getByText("Houston copy", { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();

  // What the package carried is exactly what stayed switched on.
  expect(await lastCopySelection(request)).toEqual({
    includeClaudeMd: true,
    skillSlugs: [],
    routineIds: [routineId],
    learningIds: ["learn-1"],
  });
});

/**
 * A source with nothing to pick from goes straight from the list to its name:
 * no screen ever renders empty. Back from the source list returns to the
 * dialog's chooser.
 */
test("a bare source skips the content screens; back returns to the chooser", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New agent" }).click();
  await openCopyWizard(page);

  const dialog = createDialog(page);
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Create new", exact: true }),
  ).toBeVisible();

  await openCopyWizard(page);
  await dialog.getByRole("button", { name: "Houston", exact: true }).click();
  // The seed's Memory tab has learnings, so the first content screen shows;
  // no job description, no routines, no skills.
  await expect(
    dialog.getByRole("heading", { name: "What should the copy know?" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Houston has no job description yet."),
  ).toBeVisible();
  await next(page);
  await expect(dialog.getByText("Based on Houston")).toBeVisible();
});
