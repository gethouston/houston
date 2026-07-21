import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The Routines redesign: creation is chat-first, driven by locally-rendered
 * intake cards, and the whole tab reads like an email client.
 *
 * A persistent LIST sits on the left (header "Routines" + a "New routine"
 * button; the button moves into the empty state when the list is empty). The
 * SELECTED item's chat opens in the SAME shell-level panel the Activity board
 * uses. "New routine" opens that panel over an empty chat surface and floats
 * the create intake cards above the composer: a fork ("From scratch" / "Start
 * from a template") → a wake question (schedule / event / webhook, gated on
 * `capabilities.triggers`) → a schedule idea card or template picker. Completing
 * hands off to the agent (a real setup-chat mission, tagged so it never shows on
 * the board). Rows aren't menus-only: the whole row opens its chat in the panel
 * and highlights as selected; the switch pauses it and the kebab deletes it.
 *
 * The intake cards are pure frontend (zero model calls), so the fork → wake →
 * schedule/template sequence is driven for real here. The handoff and every
 * routine chat ride the fake host's canned "Roger that." reply.
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

async function listRoutines(
  agentId: string,
): Promise<{ name: string; enabled: boolean }[]> {
  const { items } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`)
  ).json()) as { items: { name: string; enabled: boolean }[] };
  return items;
}

/** The unclaimed create-chats the intake handoff spawns (agent === routine-setup,
 *  no routine_id yet) — the durable proof a handoff mission was created. */
async function draftSetupActivities(
  agentId: string,
): Promise<{ id: string; agent?: string; routine_id?: string }[]> {
  const { items } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/activities`)
  ).json()) as { items: { id: string; agent?: string; routine_id?: string }[] };
  return items.filter(
    (a) => a.agent === "houston:routine-setup" && !a.routine_id,
  );
}

/** Arm the deployment's event-trigger capability so the wake question offers the
 *  schedule/event/webhook fork (single-player local hides it by default). */
async function armTriggers(): Promise<void> {
  await fetch(`${FAKE_HOST_URL}/__test__/capabilities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ triggers: true }),
  });
}

async function openRoutinesTab(page: Page): Promise<void> {
  await page.locator('[data-tour-target="tab-routines"]').click();
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
}

test("empty state carries the New routine button, and it opens the intake fork card", async ({
  page,
}) => {
  await page.goto("/");
  await openRoutinesTab(page);

  // Nothing yet: the empty state stands alone and owns the create button.
  await expect(page.getByText("No routines yet")).toBeVisible();

  await page.getByRole("button", { name: "New routine" }).first().click();

  // The shell panel opens over an empty chat surface with the first intake card
  // floating above the composer — the fork question, its two option radios, and
  // the always-mounted composer escape hatch below it.
  await expect(page.getByText("How do you want to start?")).toBeVisible();
  await expect(page.getByRole("radio", { name: "From scratch" })).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Start from a template" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("Describe what you'd like to automate…"),
  ).toBeVisible();

  await page.screenshot({
    path: test.info().outputPath("intake-fork-card.png"),
  });
});

test("From scratch → wake → schedule idea hands off to the agent's setup chat", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await armTriggers();

  await page.goto("/");
  await openRoutinesTab(page);
  await page.getByRole("button", { name: "New routine" }).first().click();

  // Fork → wake (the schedule/event/webhook question, gated on capabilities.triggers).
  await expect(page.getByText("How do you want to start?")).toBeVisible();
  await page.getByRole("radio", { name: "From scratch" }).click();

  // Wake → schedule idea card.
  await expect(page.getByText("When should this run?")).toBeVisible();
  await page.getByRole("radio", { name: "On a schedule" }).click();

  // Schedule idea card → pick an idea, which completes the intake.
  await expect(page.getByText("When should it run?")).toBeVisible();
  await page.getByRole("radio", { name: "Every weekday morning" }).click();

  // Handoff: the same panel becomes the real setup chat (header "New routine"
  // until a routine claims it) and the agent answers — the canned reply proves
  // the composed wake handoff was sent.
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });
  // …and the handoff created exactly one unclaimed routine-setup draft on disk.
  await expect
    .poll(async () => (await draftSetupActivities(agentId)).length, {
      timeout: 15_000,
    })
    .toBe(1);
});

test("Start from a template picks a template and hands off to the agent", async ({
  page,
}) => {
  const agentId = await seedAgentId();

  await page.goto("/");
  await openRoutinesTab(page);
  await page.getByRole("button", { name: "New routine" }).first().click();

  // Fork → the template picker (no wake question — the template resolves its own
  // schedule).
  await expect(page.getByText("How do you want to start?")).toBeVisible();
  await page.getByRole("radio", { name: "Start from a template" }).click();

  await expect(page.getByText(/Pick a template to start from/)).toBeVisible();
  await page.getByRole("button", { name: "Morning briefing" }).click();

  // Same handoff: the agent takes over the panel and a setup draft exists.
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await draftSetupActivities(agentId)).length, {
      timeout: 15_000,
    })
    .toBe(1);
});

test("a routine row opens its chat in the panel and highlights as selected", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Morning brief");

  await page.goto("/");
  await openRoutinesTab(page);

  const row = page
    .locator('[data-testid="routine-row"]')
    .filter({ hasText: "Morning brief" });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-selected", "false");

  // The whole row is the open-chat target: clicking its title (not a control)
  // opens the routine's chat in the shell panel and marks the row selected.
  await row.getByText("Morning brief").click();
  await expect(row).toHaveAttribute("aria-selected", "true");

  // The chat lands in the SAME panel the board uses, headed by the routine's
  // name, and the agent speaks first.
  await expect(page.getByText("Routine: Morning brief")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });
});

test("the row switch pauses the routine on disk", async ({ page }) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Pausable");

  await page.goto("/");
  await openRoutinesTab(page);

  const row = page
    .locator('[data-testid="routine-row"]')
    .filter({ hasText: "Pausable" });
  // Enabled by default, so the switch offers Pause; flipping it disables the
  // routine — asserted on the host, not just the UI.
  await row.getByRole("switch", { name: "Pause routine" }).click();
  await expect
    .poll(async () => (await listRoutines(agentId))[0]?.enabled)
    .toBe(false);
});

test("the row menu deletes the routine after confirming", async ({ page }) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Doomed");

  await page.goto("/");
  await openRoutinesTab(page);
  await expect(page.getByText("Doomed")).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // Nothing is removed until the dialog confirms.
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Delete Doomed?")).toBeVisible();
  expect(await listRoutines(agentId)).toHaveLength(1);

  // Cancel keeps it…
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Doomed")).toBeVisible();
  expect(await listRoutines(agentId)).toHaveLength(1);

  // …confirm removes it.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Doomed")).toHaveCount(0);
  await expect.poll(async () => (await listRoutines(agentId)).length).toBe(0);
});
