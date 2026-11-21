import { FAKE_HOST_URL, SEED_AGENT_NAME } from "@houston/fake-host";
import {
  COPY_SOURCE,
  createDialog,
  lastCopySelection,
  next,
  openCopyWizard,
  rowSwitch,
  seedCopySource,
} from "./support/copy-agent";
import { openNewAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { rail, screen } from "./support/team-nav";

test("copies an agent, leaving chosen items behind and bringing the chats", async ({
  page,
  request,
}) => {
  const { routineId } = await seedCopySource(request);
  await page.goto("/");

  await openNewAgent(page);
  await openCopyWizard(page);

  const dialog = createDialog(page);
  await dialog
    .getByRole("button", { name: SEED_AGENT_NAME, exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "What should the copy know?" }),
  ).toBeVisible();

  await expect(rowSwitch(page, "Job description and rules")).toBeChecked();
  await expect(dialog.getByText(COPY_SOURCE.instructions)).toBeVisible();
  for (const text of COPY_SOURCE.learnings) {
    await expect(rowSwitch(page, text)).toBeChecked();
  }
  await rowSwitch(page, COPY_SOURCE.learnings[1]).click();
  await expect(rowSwitch(page, COPY_SOURCE.learnings[1])).not.toBeChecked();
  const chats = rowSwitch(page, "Conversations");
  await expect(chats).not.toBeChecked();
  await chats.click();
  await expect(chats).toBeChecked();
  await next(page);

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

  await expect(dialog.getByText(`Based on ${SEED_AGENT_NAME}`)).toBeVisible();
  const nameField = dialog.getByPlaceholder(/^e\.g\. /);
  await expect(nameField).toHaveValue(`${SEED_AGENT_NAME} copy`);
  await dialog.getByRole("button", { name: "Create AI Employee" }).click();

  await expect(
    rail(page).getByText(`${SEED_AGENT_NAME} copy`, { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();

  expect(await lastCopySelection(request)).toEqual({
    includeClaudeMd: true,
    skillSlugs: [],
    routineIds: [routineId],
    learningIds: ["learn-1"],
  });

  await expect(page.getByText("Chats copied")).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(screen(page).getByText("Draft the launch email")).toBeVisible();

  const agents = (await (
    await request.get(`${FAKE_HOST_URL}/agents`)
  ).json()) as {
    id: string;
    name: string;
  }[];
  const copy = agents.find((a) => a.name === `${SEED_AGENT_NAME} copy`);
  expect(copy).toBeTruthy();
  const rows = (await (
    await request.get(`${FAKE_HOST_URL}/agents/${copy?.id}/activities`)
  ).json()) as { items: { id: string; title: string }[] };
  expect(rows.items.map((r) => r.title).sort()).toEqual([
    "Draft the launch email",
    "Plan a trip to Tokyo",
  ]);
  expect(rows.items.map((r) => r.id)).not.toContain("act-1");
  expect(rows.items.map((r) => r.id)).not.toContain("act-2");
});

test("a bare source skips the list screens; chats stay behind by default", async ({
  page,
}) => {
  await page.goto("/");
  await openNewAgent(page);
  await openCopyWizard(page);

  const dialog = createDialog(page);
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "How do you want to start?" }),
  ).toBeVisible();

  await openCopyWizard(page);
  await dialog
    .getByRole("button", { name: SEED_AGENT_NAME, exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "What should the copy know?" }),
  ).toBeVisible();
  await expect(
    dialog.getByText(`${SEED_AGENT_NAME} has no job description yet.`),
  ).toBeVisible();
  await expect(rowSwitch(page, "Conversations")).not.toBeChecked();
  await next(page);
  await expect(dialog.getByText(`Based on ${SEED_AGENT_NAME}`)).toBeVisible();
  await dialog.getByRole("button", { name: "Create AI Employee" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    rail(page).getByText(`${SEED_AGENT_NAME} copy`, { exact: true }),
  ).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toHaveCount(0);
});
