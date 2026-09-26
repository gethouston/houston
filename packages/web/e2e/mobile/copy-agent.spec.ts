import {
  COPY_SOURCE,
  createDialog,
  next,
  openCopyWizard,
  rowSwitch,
  seedCopySource,
} from "../support/copy-agent";
import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * The phone runs the SAME copy wizard inside the same create dialog; only the
 * control that opens the dialog differs (the Agents home title row's New-agent
 * control). The copy card is one of the two the dialog opens on, stacked on a
 * phone, and every wizard screen fits the phone dialog without horizontal
 * overflow.
 */
test("copies an agent from the Agents home on the phone", async ({
  page,
  request,
}) => {
  await seedCopySource(request);
  await page.goto("/");
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");

  await screen(page).getByTestId("agents-home-new-agent").click();
  const dialog = createDialog(page);
  // The dialog opens on the two ways to get an agent, stacked on a phone.
  await expect(
    dialog.getByRole("heading", { name: "How do you want to start?" }),
  ).toBeVisible();

  await openCopyWizard(page);
  await dialog.getByRole("button", { name: "Houston", exact: true }).click();
  await expect(rowSwitch(page, "Job description and rules")).toBeChecked();
  await rowSwitch(page, COPY_SOURCE.learnings[0]).click();
  await next(page);
  await expect(rowSwitch(page, COPY_SOURCE.routine.name)).toBeChecked();
  await next(page);
  await expect(rowSwitch(page, "Invoice Triage")).toBeChecked();
  await next(page);

  await expect(dialog.getByText("Based on Houston")).toBeVisible();
  await dialog.getByRole("button", { name: "Create AI Employee" }).click();
  await expect(dialog).toBeHidden();

  // Nothing forced the document wider than the phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  // The copy opens on its task list, the phone's one Tasks screen and the
  // same landing every create door uses; its header names it.
  const taskList = page.getByTestId("agent-missions-screen");
  await expect(
    taskList.getByRole("heading", { level: 1, name: "Houston copy" }),
  ).toBeVisible();
});
