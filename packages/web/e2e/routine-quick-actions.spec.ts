import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { openTeamSection } from "./support/team-nav";

async function seedAgentId(): Promise<string> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  return agents[0].id;
}

async function seedRoutine(agentId: string, name: string): Promise<void> {
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, prompt: "p", schedule: "0 9 * * *" }),
  });
}

async function routineSchedules(agentId: string): Promise<string[]> {
  const { items } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`)
  ).json()) as { items: { schedule: string }[] };
  return items.map((r) => r.schedule);
}

async function openRoutinesTab(page: import("@playwright/test").Page) {
  await openTeamSection(page, "Routines");
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
}

test.use({ teamBoard: true });

test("the schedule summary opens the inline editor and Save persists the cron", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Morning digest");

  await page.goto("/");
  await openRoutinesTab(page);
  await expect(page.getByText("Morning digest")).toBeVisible();

  await page.getByRole("button", { name: "Edit schedule" }).click();
  await page.getByRole("button", { name: "Every hour" }).click();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(
    page.getByText("Runs at the start of every hour").first(),
  ).toBeVisible();
  await expect.poll(() => routineSchedules(agentId)).toEqual(["0 * * * *"]);

  await page.screenshot({
    path: test.info().outputPath("routine-row-quick-actions.png"),
  });
});

test("Cancel discards the schedule draft and keeps the saved cron", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Morning digest");

  await page.goto("/");
  await openRoutinesTab(page);
  await expect(page.getByText("Morning digest")).toBeVisible();

  await page.getByRole("button", { name: "Edit schedule" }).click();
  await page.getByRole("button", { name: "Every hour" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(
    page.getByText("Runs every day at 9:00 AM").first(),
  ).toBeVisible();
  expect(await routineSchedules(agentId)).toEqual(["0 9 * * *"]);

  await page.getByRole("button", { name: "Edit schedule" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Runs every day at 9:00 AM").first(),
  ).toBeVisible();
  expect(await routineSchedules(agentId)).toEqual(["0 9 * * *"]);
});
