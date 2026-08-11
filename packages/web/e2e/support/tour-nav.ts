import { expect, type Page } from "@playwright/test";

/**
 * Starting the in-app onboarding the way a user does.
 *
 * Its ONE in-shell entry point is "Guide me", the first item behind the help
 * control in the rail's FOOTER — the small "?" beside Settings. Selecting it
 * lands the user on home and arms the onboarding overlay (the welcome beat)
 * over the workspace shell. The same overlay is what a first-run boot arms
 * after the survey, so this helper doubles as the "restart onboarding" path.
 *
 * The help trigger carries the `appTour` anchor — the stable handle every
 * helper here addresses it by — and the menu item is then named by its label.
 */
export async function startInAppOnboarding(page: Page): Promise<void> {
  await page.locator('[data-tour-target="appTour"]').click();
  await page.getByRole("menuitem", { name: "Guide me", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to Houston!" }),
  ).toBeVisible();
}
