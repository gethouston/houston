import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * Agent edits land live in the Routines list (AI-native reactivity). Here the
 * "agent" is a REST PATCH against the fake host — the same RoutinesChanged
 * event path a real agent edit rides. The row refreshes in place, and an open
 * "Edit manually" panel with NO local edits adopts the new values; a panel the
 * user is mid-edit in keeps their typing (local edits win until save/cancel).
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

async function openEditPanel(page: import("@playwright/test").Page) {
  await page.locator('[data-tour-target="tab-routines"]').click();
  await expect(page.getByText("Morning digest")).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit manually" }).click();
}

test("an agent edit refreshes the row and an untouched open editor adopts it", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  const routineId = await seedRoutine(agentId);

  await page.goto("/");
  await openEditPanel(page);
  const nameField = page.getByPlaceholder("e.g. Morning standup");
  await expect(nameField).toHaveValue("Morning digest");
  // The 9 AM summary shows twice: the row's meta line AND the open panel's
  // schedule picker.
  await expect(page.getByText("Runs every day at 9:00 AM")).toHaveCount(2);

  // The "agent" renames the routine and moves it to 6 PM while the panel is
  // open. No local edits, so the fields adopt the new values live…
  await patchRoutine(agentId, routineId, {
    name: "Evening digest",
    schedule: "0 18 * * *",
  });
  await expect(nameField).toHaveValue("Evening digest", { timeout: 15_000 });
  // …and BOTH the row meta and the panel's picker re-derive from the new
  // cron — neither may keep showing the pre-edit time.
  await expect(page.getByText("Runs every day at 6:00 PM")).toHaveCount(2);
  await expect(page.getByText("Runs every day at 9:00 AM")).toHaveCount(0);
  await expect(page.getByText("Evening digest")).toBeVisible();
});

test("a mid-edit panel keeps the user's typing over an agent edit", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  const routineId = await seedRoutine(agentId);

  await page.goto("/");
  await openEditPanel(page);
  const nameField = page.getByPlaceholder("e.g. Morning standup");
  await expect(nameField).toHaveValue("Morning digest");

  // The user is mid-rename when the agent's edit lands: their local value
  // must win until they save or cancel — never clobbered by the refetch.
  await nameField.fill("My own name");
  await patchRoutine(agentId, routineId, { name: "Agent name" });

  // The row title shows the agent's change; the panel keeps the user's.
  await expect(page.getByText("Agent name")).toBeVisible({ timeout: 15_000 });
  await expect(nameField).toHaveValue("My own name");
});
