import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Navigating to the settings sections that used to be sidebar entries (HOU-788).
 *
 * Usage, Permissions and Admin live inside Settings now, so every spec that used
 * to click `nav-usage` / `nav-permissions` / `nav-organization` walks the real
 * two-step path instead: the Settings nav item, then the section's row on the
 * Settings index. The rows carry stable `data-testid`s so the assertions never
 * depend on the row copy.
 */
export type SettingsSectionRow = "usage" | "permissions" | "organization";

/** The Settings index row for a section (absent when its Teams gate is off). */
export function settingsRow(page: Page, section: SettingsSectionRow): Locator {
  return page.getByTestId(`settings-row-${section}`);
}

/**
 * Open the Settings index (the sidebar nav item is always present) and wait for
 * it to be on screen. The wait is what makes a "this row is absent" assertion
 * meaningful: without it the absence could just be the index not painted yet.
 */
export async function openSettings(page: Page): Promise<void> {
  await page.locator('[data-tour-target="nav-settings"]').click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
}

/** Open Settings and drill into one of the moved sections. */
export async function openSettingsSection(
  page: Page,
  section: SettingsSectionRow,
): Promise<void> {
  await openSettings(page);
  await settingsRow(page, section).click();
}
