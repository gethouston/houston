import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * The routine row's inline schedule editor. The redesigned row has no
 * "Edit manually" panel: the schedule-summary line itself is the edit
 * affordance (always visible, never hover-gated). Clicking it opens a
 * popover with the ScheduleBuilder over a Save / Cancel footer. Save
 * commits the new cron to the host; Cancel discards the draft.
 */

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
  await page.locator('[data-tour-target="tab-routines"]').click();
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
}

test("the schedule summary opens the inline editor and Save persists the cron", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Morning digest");

  await page.goto("/");
  await openRoutinesTab(page);
  await expect(page.getByText("Morning digest")).toBeVisible();

  // The summary line is the edit affordance, visible without hovering.
  await page.getByRole("button", { name: "Edit schedule" }).click();
  await page.getByRole("button", { name: "Every hour" }).click();
  await page.getByRole("button", { name: "Save" }).click();

  // The row re-derives its summary from the new cron, and the host has it.
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

  // Nothing changed: the row keeps the 9 AM summary and the host the old cron.
  await expect(
    page.getByText("Runs every day at 9:00 AM").first(),
  ).toBeVisible();
  expect(await routineSchedules(agentId)).toEqual(["0 9 * * *"]);

  // Reopening reseeds from the live cron, so the cancelled draft never leaks:
  // an immediate Save is a no-op.
  await page.getByRole("button", { name: "Edit schedule" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Runs every day at 9:00 AM").first(),
  ).toBeVisible();
  expect(await routineSchedules(agentId)).toEqual(["0 9 * * *"]);
});
