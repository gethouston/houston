import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * Agent edits land live in the Routines list (AI-native reactivity). Here the
 * "agent" is a REST PATCH against the fake host — the same RoutinesChanged
 * event path a real agent edit rides. The row's title and schedule summary
 * refresh in place, and an OPEN inline schedule editor is never closed or
 * clobbered by the refetch: the user's in-progress edit survives.
 */

async function seedAgentId(): Promise<string> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  return agents[0].id;
}

async function seedRoutine(agentId: string): Promise<string> {
  const created = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Morning digest",
        prompt: "Summarize my inbox.",
        schedule: "0 9 * * *",
      }),
    })
  ).json()) as { id: string };
  return created.id;
}

async function patchRoutine(
  agentId: string,
  routineId: string,
  updates: Record<string, string>,
): Promise<void> {
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines/${routineId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(updates),
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

test("an agent edit refreshes the row's title and schedule summary live", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  const routineId = await seedRoutine(agentId);

  await page.goto("/");
  await openRoutinesTab(page);
  await expect(page.getByText("Morning digest")).toBeVisible();
  await expect(page.getByText("Runs every day at 9:00 AM")).toBeVisible();

  // The "agent" renames the routine and moves it to 6 PM. The row refreshes
  // in place — no reload, no tab switch.
  await patchRoutine(agentId, routineId, {
    name: "Evening digest",
    schedule: "0 18 * * *",
  });
  await expect(page.getByText("Evening digest")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Runs every day at 6:00 PM")).toBeVisible();
  await expect(page.getByText("Runs every day at 9:00 AM")).toHaveCount(0);
  await expect(page.getByText("Morning digest")).toHaveCount(0);
});

test("an open schedule editor survives an agent edit", async ({ page }) => {
  const agentId = await seedAgentId();
  const routineId = await seedRoutine(agentId);

  await page.goto("/");
  await openRoutinesTab(page);
  await expect(page.getByText("Morning digest")).toBeVisible();

  // The user opens the inline schedule editor…
  await page.getByRole("button", { name: "Edit schedule" }).click();
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeVisible();

  // …and the agent's rename lands while it is open. The row title adopts the
  // new name live, but the editor stays open — the refetch never closes the
  // user's in-progress edit.
  await patchRoutine(agentId, routineId, { name: "Agent name" });
  await expect(page.getByText("Agent name")).toBeVisible({ timeout: 15_000 });
  await expect(save).toBeVisible();

  // Saving the untouched draft is a no-op: the host keeps the same cron.
  await save.click();
  expect(await routineSchedules(agentId)).toEqual(["0 9 * * *"]);
});
