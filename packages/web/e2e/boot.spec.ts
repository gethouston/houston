import { expect, test } from "./support/fixtures";

/**
 * The whole harness in one spec: the full desktop UI boots in the browser, on
 * the host adapter (host mode), against the fake host — past the
 * engine Connect screen, the language picker, and the legal disclaimer — and the
 * files-first board data (`.houston/activity/activity.json`) flows through.
 */
test("boots past every gate to the app shell", async ({ page }) => {
  await page.goto("/");

  // Shell chrome.
  // Scoped to the nav entry: "Mission Control" is now also the name of every
  // team block's first destination row.
  await expect(
    page.locator("[data-tour-target='nav-dashboard']"),
  ).toBeVisible();
  await expect(page.getByText("Your teams")).toBeVisible();
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible();

  // The board rendered with its three columns + the seeded missions (proves the
  // files-first data path works end-to-end).
  await expect(page.getByText("Running")).toBeVisible();
  await expect(page.getByText("Needs you")).toBeVisible();
  await expect(page.getByText("Done", { exact: true })).toBeVisible();
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  // None of the boot gates are left on screen.
  await expect(
    page.getByText(
      /Connecting to engine|Loading your workspace|Language · Idioma|Can't reach the engine/i,
    ),
  ).toHaveCount(0);
});
