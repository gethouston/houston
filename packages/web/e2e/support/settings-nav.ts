import { expect, type Locator, type Page } from "@playwright/test";
import { screen } from "./team-nav";

/**
 * Navigating the rail's ANCHORLESS top-level destinations, plus Settings.
 *
 * **Admin is the one top-level screen this helper reaches.** It is the whole of
 * the rail's "Workspace" band that belongs here: Permissions is gone (agent
 * policy is discovered through a team's "Manage agents" section — see
 * `team-nav.ts` `openAgentSettings`) and Time worked is a LENS inside
 * Admin > Analytics rather than a screen. **About me** joins it: an ungated row
 * in the rail's lead run, so it is addressed the same way.
 *
 * Neither Admin nor About me carries a tour anchor (the tour walks neither), so
 * each is addressed by its accessible name inside the rail; English is forced by
 * the boot seed, so the labels are stable (`app/src/locales/en/settings.json`
 * `nav.organization` = "Admin", `shell:sidebar.aboutMe` = "About me"). Settings
 * is the exception and keeps its `nav-settings` anchor.
 *
 * Scoped to the WHOLE rail (`sidebar`), not to `agents`: that inner anchor wraps
 * only the "Your teams" band, and the top-level destinations sit above it.
 *
 * Everything BELOW a rail row is scoped through `screen()` — every top-level
 * view is kept alive, so several screens sit in the DOM at once and a bare
 * page-level lookup can match a hidden one.
 */
function railRow(page: Page, name: string): Locator {
  return page
    .locator("[data-tour-target='sidebar']")
    .getByRole("button", { name, exact: true });
}

/** The rail's Admin row (absent whenever the org gate is off). */
export function adminRow(page: Page): Locator {
  return railRow(page, "Admin");
}

/** The rail's About me row. Ungated: it exists in every deployment. */
export function aboutMeRow(page: Page): Locator {
  return railRow(page, "About me");
}

/** Open the Admin (Organization) dashboard from the rail, on its index. */
export async function openAdmin(page: Page): Promise<void> {
  await adminRow(page).click();
  await expect(
    screen(page).getByRole("heading", { name: "Admin", level: 1 }),
  ).toBeVisible();
}

/**
 * Open About me from the rail: the standing context every agent loads about the
 * PERSON. A top-level screen owning the whole window, so there is no back bar
 * and nothing to drill into — landing on the `<h1>` is the whole navigation.
 */
export async function openAboutMe(page: Page): Promise<void> {
  await aboutMeRow(page).click();
  await expect(
    screen(page).getByRole("heading", { name: "About me", level: 1 }),
  ).toBeVisible();
}

/** The rows of the Admin index, as it labels them (`teams:org.tabs.*`). */
export type AdminSection =
  | "People"
  | "Billing"
  | "Analytics"
  | "Company context";

/**
 * Open Admin and drill into one of its sections.
 *
 * The index rows are `SettingsRow` buttons whose accessible name is the title
 * followed by the row's description and value ("People Invite teammates, set
 * roles, remove members. 2 members"), so the row is matched on its title as a
 * PREFIX. The detail screen's `<h1>` carries the same words, which is what the
 * wait lands on — an assertion made before it could read the index instead.
 */
export async function openAdminSection(
  page: Page,
  name: AdminSection,
): Promise<void> {
  await openAdmin(page);
  await screen(page)
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
  await expect(
    screen(page).getByRole("heading", { name, level: 1, exact: true }),
  ).toBeVisible();
}

/** The three lenses of Admin > Analytics, as its sub-tabs label them. */
export type AnalyticsLens = "Activity" | "Usage" | "Time worked";

/**
 * Open one lens of Admin > Analytics. Only the SELECTED lens is mounted, so
 * this is also what makes a lens's data load at all — and "Time worked" only
 * exists where the gateway advertises `computeUsage`, which is why an absent
 * sub-tab (not an absent rail row) is how that gate is observed now.
 */
export async function openAnalyticsLens(
  page: Page,
  lens: AnalyticsLens,
): Promise<void> {
  await openAdminSection(page, "Analytics");
  const tab = screen(page).getByRole("tab", { name: lens, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("data-state", "active");
}

/**
 * Open the Settings index and wait for it to be on screen. The Settings entry
 * moved to the rail's FOOTER but kept its tour anchor and its accessible name,
 * so this locator is unchanged — if the footer ever drops `nav-settings`, this
 * is the one place to re-point.
 *
 * The wait is what makes a "this row is absent" assertion meaningful: without it
 * the absence could just be the index not painted yet.
 */
export async function openSettings(page: Page): Promise<void> {
  await page.locator('[data-tour-target="nav-settings"]').click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
}
