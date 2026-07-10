import { expect, type Page } from "@playwright/test";

/**
 * Create an agent through the real dialog and return to a usable shell.
 *
 * The reworked create flow (`create-workspace-dialog.tsx`) has NO full-screen
 * activation step. On create success the dialog fires the agent's self-setup
 * mission in the normal shell (`startAgentSetupMission`), switches to the board
 * view, and auto-opens the chat panel on that mission
 * (`setActivityPanelId(conversationId, { forceOpen: true })`). The dialog then
 * closes immediately — the in-dialog "connect" step only appears when the
 * template declares integrations AND the deployment serves them, and the fake
 * host advertises `integrations: []`, so a from-scratch create never reaches it.
 *
 * This shared helper leaves callers on the board with the auto-opened panel
 * DISMISSED, so sidebar/board interactions aren't obstructed by the ~45%-width
 * chat panel. It asserts the panel really opened on the setup mission first, so
 * a broken auto-open fails loudly here instead of silently later.
 */
export async function createAgent(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New agent" }).click();
  const scratch = page.getByText("From scratch");
  await scratch.waitFor({ state: "visible" });
  await scratch.click();
  const nameField = page.getByPlaceholder("e.g. Product manager, Sales, Jerry");
  await nameField.waitFor({ state: "visible" });
  await nameField.fill(name);
  await page.getByRole("button", { name: "Create Agent" }).click();

  // The dialog closes and the setup-mission chat auto-opens as a right-side
  // panel. Its "Getting set up" mission uses the follow-up composer (an
  // existing conversation), so that composer is the stable "panel opened"
  // signal — independent of the setup-mission bubble copy.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 10_000,
  });

  await closeActivityPanel(page);

  // Back in the shell: the sidebar (with its New-agent control) is interactive
  // again and the new agent is present in it.
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible();
  await expect(
    page.locator("[data-tour-target='agents']").getByText(name).first(),
  ).toBeVisible();
}

/**
 * Dismiss the auto-opened activity (chat) panel. Escape closes the mission
 * panel, but if the composer holds focus the first press only blurs it (and a
 * mid-flight streamed turn can swallow one press to stop streaming), so press
 * until the panel's composer is gone.
 */
export async function closeActivityPanel(page: Page): Promise<void> {
  const composer = page.getByPlaceholder("Send a follow-up...");
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(composer).toBeHidden({ timeout: 400 });
  }).toPass({ timeout: 5_000 });
}
