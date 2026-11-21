import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { missionCard, openTeamSection } from "./support/team-nav";

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

async function armTriggers(): Promise<void> {
  await fetch(`${FAKE_HOST_URL}/__test__/capabilities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ triggers: true }),
  });
}

async function openRoutinesTab(page: Page): Promise<void> {
  await openTeamSection(page, "Routines");
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
}

test.use({ teamBoard: true });

test("empty state carries the New routine button, and it opens the intake fork card", async ({
  page,
}) => {
  await page.goto("/");
  await openRoutinesTab(page);

  await expect(page.getByText("No routines yet")).toBeVisible();

  await page.getByRole("button", { name: "New routine" }).first().click();

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

  await expect(page.getByText("How do you want to start?")).toBeVisible();
  await page.getByRole("radio", { name: "From scratch" }).click();

  await expect(page.getByText("When should this run?")).toBeVisible();
  await page.getByRole("radio", { name: "On a schedule" }).click();

  await expect(page.getByText("When should it run?")).toBeVisible();
  await page.getByRole("radio", { name: "Every weekday morning" }).click();

  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });
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

  await expect(page.getByText("How do you want to start?")).toBeVisible();
  await page.getByRole("radio", { name: "Start from a template" }).click();

  await expect(page.getByText(/Pick a template to start from/)).toBeVisible();
  await page.getByRole("button", { name: "Morning briefing" }).click();

  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await draftSetupActivities(agentId)).length, {
      timeout: 15_000,
    })
    .toBe(1);
});

test("a routine row opens its screen, and Edit in chat continues to the panel chat", async ({
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

  await row.getByText("Morning brief").click();
  await expect(
    page.getByRole("heading", { name: "Morning brief" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "What this routine does" }),
  ).toHaveValue("p");
  await expect(
    page.getByRole("button", { name: "Runs", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit in chat" }).click();
  await expect(page.getByText("Routine: Morning brief")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });
});

test("switching tabs never stacks two chat panels in the shared shell panel (HOU-1165)", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Morning brief");

  await page.goto("/");

  await missionCard(page, "Plan a trip to Tokyo").click();
  const panel = page.getByTestId("mission-panel");
  await expect(panel.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
  await expect(panel.locator("textarea")).toHaveCount(1);

  await openRoutinesTab(page);
  const row = page
    .locator('[data-testid="routine-row"]')
    .filter({ hasText: "Morning brief" });
  await row.getByText("Morning brief").click();
  await page.getByRole("button", { name: "Edit in chat" }).click();

  await expect(panel.getByText("Routine: Morning brief")).toBeVisible({
    timeout: 15_000,
  });
  await expect(panel.getByText("Task: Plan a trip to Tokyo")).toHaveCount(0);
  await expect(panel.locator("textarea")).toHaveCount(1);
});

test("the row switch pauses the routine on disk", async ({ page }) => {
  const agentId = await seedAgentId();
  await seedRoutine(agentId, "Pausable");

  await page.goto("/");
  await openRoutinesTab(page);

  const row = page
    .locator('[data-testid="routine-row"]')
    .filter({ hasText: "Pausable" });
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

  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Delete Doomed?")).toBeVisible();
  expect(await listRoutines(agentId)).toHaveLength(1);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Doomed")).toBeVisible();
  expect(await listRoutines(agentId)).toHaveLength(1);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Doomed")).toHaveCount(0);
  await expect.poll(async () => (await listRoutines(agentId)).length).toBe(0);
});
