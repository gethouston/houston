import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/**
 * Open the empty new-mission composer from the board's "New mission" control.
 *
 * Every board is cross-agent now (the global one and every team's), so the
 * control asks WHICH agent before opening the composer — the per-agent board
 * that needed no such question is gone. The seeded workspace has one agent, so
 * the dialog is a single click.
 */
export async function openNewMission(
  page: Page,
  agentName = "Houston",
): Promise<void> {
  await page.locator('[data-tour-target="newMission"]').first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: agentName, exact: true })
    .click();
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
