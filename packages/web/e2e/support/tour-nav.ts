import { expect, type Page } from "@playwright/test";

/**
 * Starting the guided tour the way a user does.
 *
 * The tour's ONE entry point is "Guide me", the first item behind the help
 * control in the rail's FOOTER — the small "?" beside Settings. It used to be a
 * permanent row in the rail's lead run, which spent a standing destination slot
 * on the one entry that pointed at no screen and could therefore never light;
 * asking for help is not a destination, so it wears a help control instead.
 *
 * That trigger carries the `appTour` anchor the tour's own replay step
 * spotlights, which is what this addresses it by — the same stable handle every
 * other tour helper uses — and the menu item is then named by its label.
 */
export async function startGuidedTour(page: Page): Promise<void> {
  await page.locator('[data-tour-target="appTour"]').click();
  await page.getByRole("menuitem", { name: "Guide me", exact: true }).click();
  await expect(page.getByText(/Tour 1 of/)).toBeVisible();
}
