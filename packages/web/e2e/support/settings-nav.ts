import { expect, type Locator, type Page } from "@playwright/test";
import { ASSISTANT_COMPOSER } from "./composer";
import { moreMenu, openMoreMenu } from "./mobile-nav";
import { screen } from "./team-nav";

/** Settings sections and the rail's Assistant, Skills, and Admin screens. */

/**
 * The Settings index's About me row. What the agents know about the PERSON is
 * a standing preference, so it is a section of Settings rather than a rail
 * destination, and it is reached the way a user reads it: by name, on the
 * index (`settings:nav.aboutMe` = "About me").
 *
 * Anchored on the row's TITLE rather than its whole accessible name: every
 * settings row reads its description out too (`settings:index.rows.aboutMe`),
 * so the name is the title plus that sentence, and an exact match would pin
 * copy this helper has no business owning.
 */
export function aboutMeRow(page: Page): Locator {
  return screen(page).getByRole("button", { name: /^About me/ });
}

/**
 * The rail's AI Manager row, leading the unlabelled run. Gated on DISCOVERY
 * (`GET /v1/assistant`), not on a role: a deployment that serves none has no
 * row at all. It carries no tour anchor.
 */
export function assistantRow(page: Page): Locator {
  // By test id, never by name: the row's label is product copy that moves
  // (`shell:sidebar.assistant`), and the test id also appears only once
  // discovery has answered, so a click waits for the gate rather than racing it.
  return page.getByTestId("rail-assistant");
}

/**
 * Open the personal assistant from the rail: a 1-on-1 chat owning the whole
 * window, so there is no back bar, no panel header and nothing to drill into.
 * The COMPOSER is therefore the landing — a 1-on-1 chat opens on the place the
 * user types, and it is the one part of the surface that stands whether the
 * thread is empty or already long.
 */
export async function openAssistant(page: Page): Promise<void> {
  await assistantRow(page).click();
  await expect(screen(page).getByPlaceholder(ASSISTANT_COMPOSER)).toBeVisible();
}

/** The gated Admin row, shared by the rail and phone More menu. */
export function adminRow(page: Page): Locator {
  return (page.viewportSize()?.width ?? 768) < 768
    ? moreMenu(page).getByTestId("rail-admin")
    : page.locator('[data-tour-target="sidebar"]').getByTestId("rail-admin");
}

/**
 * The Admin dashboard's identity heading — the `<h1>` inside the header
 * cluster (`teams:org.title` = "Workspace").
 */
export function adminHeading(page: Page): Locator {
  return screen(page).getByRole("heading", { name: "Workspace", level: 1 });
}

/**
 * The rail's Skills row — the door to the shared library every agent in the
 * space draws from. Shown to the SPACE OWNER, because editing a skill edits
 * everyone's agents at once.
 *
 * By test id, like the AI Manager row and for the same reason: it carries no
 * tour anchor (the tour does not walk it), and its label is product copy that
 * moves. The phone's More menu draws the same row with the same attributes.
 */
export function skillsRow(page: Page): Locator {
  return page.getByTestId("rail-skills");
}

/**
 * Open the shared Skills library: its own screen, from its own rail row. The
 * landing waits on the SCREEN marker rather than the row's highlight — the row
 * repaints synchronously on click, so only the screen attribute proves the
 * view actually swapped in before a spec's first assertion runs.
 */
export async function openSkillsLibrary(page: Page): Promise<void> {
  await skillsRow(page).click();
  await expect(screen(page)).toHaveAttribute("data-screen", "skills-home");
}

/** Open Admin through the rail row or the phone More menu. */
export async function openAdmin(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 768) < 768)
    await openMoreMenu(page, "click");
  await adminRow(page).click();
  await expect(screen(page)).toHaveAttribute("data-screen", "admin");
  await expect(adminHeading(page)).toBeVisible();
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
  | "Org chart"
  | "Company context";

/** Section name -> the `data-admin-section-tab` value its lozenge carries. */
export const ADMIN_SECTION_TAB_IDS: Readonly<Record<AdminSection, string>> = {
  "Company context": "companyContext",
  "Org chart": "orgChart",
  People: "people",
  Billing: "billing",
  Activity: "activity",
  Usage: "usage",
  "Time worked": "timeWorked",
};

/** One section lozenge of the Admin header cluster, by section. */
export function adminSectionTab(page: Page, name: AdminSection): Locator {
  return screen(page).locator(
    `[data-admin-section-tab='${ADMIN_SECTION_TAB_IDS[name]}']`,
  );
}

/** The phone's replacement for the full Admin section cluster. */
function adminSectionSwitcher(page: Page): Locator {
  return screen(page).locator("[data-admin-section-switcher]");
}

/**
 * Assert exactly which sections Admin offers, in either layout.
 *
 * Reading the WHOLE cluster is what makes an absence meaningful: on the phone
 * the lozenges live in a closed menu, so a bare "this section's lozenge has
 * count 0" would pass on every collapsed header whatever the space's gates
 * say.
 */
export async function expectAdminSections(
  page: Page,
  names: readonly AdminSection[],
): Promise<void> {
  const tabs = screen(page).locator("[data-admin-section-tab]");
  if (await tabs.first().isVisible()) {
    await expect(tabs).toHaveCount(names.length);
    for (const name of names)
      await expect(adminSectionTab(page, name)).toBeVisible();
    return;
  }

  const switcher = adminSectionSwitcher(page);
  await expect(switcher).toBeVisible();
  await switcher.click();
  const menuSections = page.locator(
    "[role='menuitemcheckbox'][data-admin-section-tab]",
  );
  await expect(menuSections).toHaveCount(names.length);
  for (const name of names) {
    await expect(
      page.locator(
        `[role='menuitemcheckbox'][data-admin-section-tab='${ADMIN_SECTION_TAB_IDS[name]}']`,
      ),
    ).toBeVisible();
  }
  await page.keyboard.press("Escape");
}

/**
 * Open Admin on one of its sections.
 *
 * The sections are lozenges in the header cluster (the shared grammar with the
 * employee screen), addressed by their `data-admin-section-tab` id so the helper
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
  const tab = adminSectionTab(page, name);
  if (await tab.isVisible()) {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-current", "page");
  } else {
    // Phone: the cluster is a menu, so the section is picked from inside it.
    await adminSectionSwitcher(page).click();
    await page
      .locator(`[role='menuitemcheckbox'][data-admin-section-tab='${id}']`)
      .click();
  }
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
