import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/** Start a fresh mission and wait until its seeded first reply has settled. */
export async function startMission(page: Page, text: string): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();
  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();
  await composer.fill(text);
  await composer.press("Enter");
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
}
