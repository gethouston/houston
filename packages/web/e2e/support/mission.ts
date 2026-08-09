import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/**
 * Open the empty new-mission composer from the board's "New mission" control.
 *
 * A multi-agent board asks which agent should own the task. A board with only
 * one eligible agent skips that redundant question and opens the composer
 * directly.
 */
export async function openNewMission(
  page: Page,
  agentName = "Houston",
): Promise<void> {
  await page
    .locator("[data-screen-active='true']")
    .locator('[data-tour-target="newMission"]')
    .first()
    .click();

  const composer = page.getByPlaceholder("What should the agent work on?");
  const agentChoice = page
    .getByRole("dialog")
    .getByRole("button", { name: agentName, exact: true });
  const connectAi = page.getByRole("button", { name: "Connect AI" });
  // `.first()`: two of these can be visible at once (a composer behind an
  // agent-picker dialog), and a bare or-chain trips strict mode exactly then.
  await composer
    .or(agentChoice)
    .or(connectAi)
    .first()
    .waitFor({ state: "visible" });
  if (await agentChoice.isVisible()) await agentChoice.click();
}

/** Start a fresh mission and wait until its seeded first reply has settled. */
export async function startMission(page: Page, text: string): Promise<void> {
  await page.goto("/");
  await openNewMission(page);
  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();
  await composer.fill(text);
  await composer.press("Enter");
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
}
