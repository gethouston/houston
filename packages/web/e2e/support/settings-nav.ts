import { expect, type Locator, type Page } from "@playwright/test";
import { screen } from "./team-nav";

/**
 * Navigating the rail's ANCHORLESS top-level destinations, plus Settings and
 * the sections inside it.
 *
 * **Admin is the one top-level screen this helper reaches.** It is the whole of
 * the rail's "Workspace" band that belongs here: Permissions is gone (agent
 * policy is discovered through a team's focused agent screen, see
 * `team-nav.ts` `openAgentSettings`). The **Assistant** joins it, leading the
 * rail's lead run, so it is addressed the same way.
 *
 * Neither carries a tour anchor (the tour walks neither), so each is addressed
 * by its accessible name inside the rail; English is forced by the boot seed,
 * so the labels are stable (`app/src/locales/en/settings.json`
 * `nav.organization` = "Admin", `shell:sidebar.assistant` = "Houston").
 * Settings is the exception and keeps its `nav-settings` anchor.
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

/**
 * The Settings index's About me row. What the agents know about the PERSON is
 * a standing preference, so it is a section of Settings rather than a rail
 * destination, and it is reached the way a user reads it: by name, on the
 * index (`settings:nav.aboutMe` = "About me").
 */
export function aboutMeRow(page: Page): Locator {
  return screen(page).getByRole("button", { name: "About me", exact: true });
}

/**
 * The rail's Assistant row, leading the unlabelled run. Gated on DISCOVERY
 * (`GET /v1/assistant`), not on a role: a deployment that serves none has no
 * row at all. It carries no tour anchor, so its name is the handle.
 */
export function assistantRow(page: Page): Locator {
  return railRow(page, "Houston");
}

/**
 * Open the personal assistant from the rail: a 1-on-1 chat owning the whole
 * window, so there is no back bar and nothing to drill into. Landing on the
 * panel header's name is the whole navigation.
 */
export async function openAssistant(page: Page): Promise<void> {
  await assistantRow(page).click();
  await expect(screen(page).getByText("Your personal assistant")).toBeVisible();
}

/**
 * Open the Admin (Organization) dashboard from the rail, ALWAYS on its home:
 * the rail door pins the landing section, so the kept-alive screen never
 * resumes on a leftover one. Home is Company context, standing behind the
 * header's identity lozenge — which wears the rail row's glyph and name
 * ("Admin") and carries the screen's `<h1>`; the section titles itself in its
 * body instead.
 */
export async function openAdmin(page: Page): Promise<void> {
  await adminRow(page).click();
  await expect(
    screen(page).getByRole("heading", { name: "Admin", level: 1 }),
  ).toBeVisible();
}

/**
 * Open About me: the standing context every agent loads about the PERSON, a
 * section of Settings. Two steps, because it IS two levels — the index, then
 * the drill-in, whose own `<h2>` proves it landed.
 */
export async function openAboutMe(page: Page): Promise<void> {
  await openSettings(page);
  await aboutMeRow(page).click();
  await expect(
    screen(page).getByRole("heading", { name: "About me", level: 2 }),
  ).toBeVisible();
}

/** The sections of the Admin header cluster, as it labels them (`teams:org.tabs.*`). */
export type AdminSection =
  | "People"
  | "Billing"
  | "Activity"
  | "Usage"
  | "Time worked"
  | "Company context";

/** Section name -> the `data-admin-section-tab` value its lozenge carries. */
export const ADMIN_SECTION_TAB_IDS: Readonly<Record<AdminSection, string>> = {
  "Company context": "companyContext",
  People: "people",
  Billing: "billing",
  Activity: "activity",
  Usage: "usage",
  "Time worked": "timeWorked",
};

/**
 * Open Admin on one of its sections.
 *
 * The sections are lozenges in the header cluster (the shared grammar with the
 * team screen), addressed by their `data-admin-section-tab` id so the helper
 * survives label changes. The landing waits on the BODY's
 * `data-admin-section-body` marker, not just the lozenge's `aria-current`: the
 * lozenge repaints synchronously on click, so only the body attribute proves
 * the section actually swapped in before a spec's first assertion runs.
 */
export async function openAdminSection(
  page: Page,
  name: AdminSection,
): Promise<void> {
  await openAdmin(page);
  const id = ADMIN_SECTION_TAB_IDS[name];
  const tab = screen(page).locator(`[data-admin-section-tab='${id}']`);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect(
    screen(page).locator(`[data-admin-section-body='${id}']`),
  ).toBeVisible();
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
