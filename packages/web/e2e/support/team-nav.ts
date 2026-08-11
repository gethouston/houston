import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Navigating the teams shell, for specs that used to click an agent tab.
 *
 * The per-agent tab strip is gone: an agent's WORK is a section of its team
 * (Tasks / Routines / Files, reached from the TEAM SCREEN's own tab row) and an
 * agent's CONFIGURATION is reached from the focused agent screen.
 * These helpers are the one place those two paths are spelled out, so a spec
 * says what it wants ("open Files", "open this agent's Skills") instead of
 * re-deriving the route.
 *
 * The rail names TEAMS; the tab row names a team's SECTIONS. Nothing in the
 * rail switches sections any more.
 *
 * English is forced by the boot seed, so label selectors are stable.
 *
 * The functional desktop projects use a 1440px-wide viewport deliberately:
 * after the rail takes its space, the team strip remains above its one-row
 * threshold and these helpers exercise the full lozenge grammar. Compact
 * switcher behavior belongs in explicit narrow-viewport specs, rather than
 * becoming the accidental default for every desktop flow.
 */

/**
 * Literal text, safe to drop inside a `RegExp`. Agent names are caller-supplied
 * product data: a "Q3 P&L (draft)" or "houston.ai bot" would otherwise turn its
 * `.`/`(`/`+` into pattern syntax and match the wrong row, or throw outright.
 */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The rail. Section rows and agent rows both live here. */
export function rail(page: Page): Locator {
  return page.locator("[data-tour-target='agents']");
}

/** The top-level rail rows, by the tour anchor the shell stamps on each. */
export type NavRowId =
  | "inbox"
  | "agent-store"
  | "integrations"
  | "ai-hub"
  | "skills"
  | "settings";

/**
 * One top-level rail row — a destination that belongs to nobody.
 *
 * The Inbox, About me and the Agent Store lead the rail unlabelled, then the
 * "My accounts" band (Integrations, AI Models) and the "Workspace" band (Admin,
 * Skills), with Settings in the footer. **About me is deliberately absent from
 * this union**: it carries no tour anchor, because a target the tour never
 * spotlights is dead weight — address it through `settings-nav.ts`
 * `aboutMeRow` / `openAboutMe`, which go by accessible name.
 *
 * There is NO global mission board among them: every board belongs to a team,
 * so a spec that wants the app's home board asks for
 * {@link openTeamSection}`(page, "Tasks")` instead.
 */
export function navRow(page: Page, id: NavRowId): Locator {
  return page.locator(`[data-tour-target='nav-${id}']`);
}

/**
 * Open the Inbox: the missions a teammate named you in. It is the one screen
 * that needs no team, which is why the app waits there when none has resolved.
 */
export async function openInbox(page: Page): Promise<void> {
  await navRow(page, "inbox").click();
}

/**
 * The screen ON THE GLASS.
 *
 * Every top-level view is kept alive, so several screens sit in the DOM at
 * once and only one is displayed. A bare page-level lookup therefore matches
 * the hidden ones too (a task card exists on Tasks AND on its
 * team's board), which is a strict-mode violation at best and a click on an
 * invisible element at worst. Scope board and section lookups through this.
 */
export function screen(page: Page): Locator {
  return page.locator("[data-screen-active='true']");
}

/**
 * Narrow a set of rail rows to the one(s) saying "you are here".
 *
 * Every row in the rail is now a root element carrying the row's identity (its
 * `data-sidebar-*` attributes, its tour anchor) wrapped around an inner
 * `<button>`, and `aria-current="page"` lives on that button — the affordance
 * beside it, a "..." menu or a "+", is a SIBLING and may not be nested in it.
 * So "is this row the current one?" is a question about what the row CONTAINS,
 * never an attribute of the row itself.
 */
export function litRows(rows: Locator): Locator {
  return rows.filter({ has: rows.page().locator("[aria-current='page']") });
}

/**
 * A team's sections, named the way a user would say them.
 *
 * The strip's first lozenge IS the team — its glyph, its name, and the pinned
 * agent — and it is the board's door, so the word "Tasks" appears nowhere in
 * the chrome. Specs still ASK for "Tasks", because that is what the section is
 * called; the map below is the one place that knows it is drawn as the team.
 */
export type TeamSection =
  | "Tasks"
  | "Routines"
  | "Files"
  | "Context"
  | "People"
  | "Agent settings";

/** Section name -> the `data-team-section-tab` value its lozenge carries. */
export const TEAM_SECTION_TAB_IDS: Readonly<Record<TeamSection, string>> = {
  Tasks: "mission-control",
  Routines: "routines",
  Files: "files",
  Context: "context",
  People: "people",
  "Agent settings": "settings",
};

export async function openArchivedTasks(page: Page): Promise<void> {
  await screen(page).getByRole("button", { name: "Archived" }).click();
}

export async function returnToActiveTasks(page: Page): Promise<void> {
  await screen(page).getByRole("button", { name: "Back to tasks" }).click();
}

/** The team screen's lozenge cluster, on the open team. */
export function teamTabs(page: Page): Locator {
  return screen(page).locator("[data-team-section-tab]");
}

/** One lozenge of the open team, by section. */
export function teamTab(page: Page, section: TeamSection): Locator {
  return screen(page).locator(
    `[data-team-section-tab='${TEAM_SECTION_TAB_IDS[section]}']`,
  );
}

/** The team row to return through when no team screen is on the glass: the
 *  expanded block if one exists, else the FIRST block. Requiring an expanded
 *  one would strand the helper on a top-level view after every block folded —
 *  a folded header is still a door (clicking it opens the team). */
function currentTeamRow(page: Page): Locator {
  const headers = rail(page).locator(
    "[data-sidebar-group-header], [data-sidebar-default-header]",
  );
  return headers
    .filter({ has: page.locator("button[aria-expanded='true']") })
    .or(headers)
    .first();
}

/** The compact replacement for the full team-section lozenge cluster. */
function teamSectionSwitcher(page: Page): Locator {
  return screen(page).locator("[data-team-section-switcher]");
}

/** Assert the selected section in either the full strip or compact menu. */
export async function expectTeamSectionSelected(
  page: Page,
  section: TeamSection,
): Promise<void> {
  const tab = teamTab(page, section);
  if (await tab.isVisible()) {
    await expect(tab).toHaveAttribute("aria-current", "page");
    return;
  }

  const switcher = teamSectionSwitcher(page);
  await expect(switcher).toBeVisible();
  await switcher.click();
  await expect(
    page.locator(
      `[role='menuitemcheckbox'][data-team-section-tab='${TEAM_SECTION_TAB_IDS[section]}']`,
    ),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
}

/** Assert exactly which sections the current team offers in either layout. */
export async function expectTeamSections(
  page: Page,
  sections: readonly TeamSection[],
): Promise<void> {
  const tabs = teamTabs(page);
  if (await tabs.first().isVisible()) {
    await expect(tabs).toHaveCount(sections.length);
    for (const section of sections)
      await expect(teamTab(page, section)).toBeVisible();
    return;
  }

  const switcher = teamSectionSwitcher(page);
  await expect(switcher).toBeVisible();
  await switcher.click();
  const menuSections = page.locator(
    "[role='menuitemcheckbox'][data-team-section-tab]",
  );
  await expect(menuSections).toHaveCount(sections.length);
  for (const section of sections) {
    await expect(
      page.locator(
        `[role='menuitemcheckbox'][data-team-section-tab='${TEAM_SECTION_TAB_IDS[section]}']`,
      ),
    ).toBeVisible();
  }
  await page.keyboard.press("Escape");
}

async function clickVisibleTeamSection(
  page: Page,
  section: TeamSection,
): Promise<boolean> {
  const tab = teamTab(page, section);
  if (await tab.isVisible()) {
    try {
      await tab.click({ timeout: 5_000 });
      return true;
    } catch {
      // The strip re-modes when its width observer reports — on a slow CI box
      // that can land BETWEEN the visibility check and the click, unmounting
      // the tab cluster into the compact switcher. The section is still
      // reachable; it just moved. Fall through to the switcher path.
    }
  }

  const switcher = teamSectionSwitcher(page);
  if (await switcher.isVisible()) {
    await switcher.click();
    await page
      .locator(
        `[role='menuitemcheckbox'][data-team-section-tab='${TEAM_SECTION_TAB_IDS[section]}']`,
      )
      .click();
    return true;
  }

  return false;
}

/**
 * Open a section of the team that is already OPEN.
 *
 * The rail no longer draws section rows: a team's sections are the lozenge
 * cluster on the team screen itself, which is why this reaches into the screen
 * on the glass rather than into the rail. Opening a DIFFERENT team is a
 * separate act (click its block in the rail) — this switches sections, not
 * teams.
 *
 * Note the one asymmetry, which is the home lozenge's grammar and not a quirk
 * of this helper: asking for "Tasks" while already on a PINNED board clears
 * the pin instead of navigating, because there is nowhere to navigate to.
 */
export async function openTeamSection(
  page: Page,
  section: TeamSection,
): Promise<void> {
  const teamRow = currentTeamRow(page);
  // `.first()` on every or-chain wait: more than one surface being visible at
  // once (tab cluster on screen AND the team's rail row) is the NORMAL state,
  // and a bare or-chain trips strict mode exactly then. These waits ask "has
  // at least one navigation surface arrived", not "is there exactly one".
  await expect(
    teamTab(page, section).or(teamSectionSwitcher(page)).or(teamRow).first(),
    `a team navigation surface for "${section}" should become available`,
  ).toBeVisible();

  if (await clickVisibleTeamSection(page, section)) return;

  await teamRow.getByRole("button").first().click();
  await expect(
    teamTab(page, section).or(teamSectionSwitcher(page)).first(),
    `the team section controls should appear after returning to the team`,
  ).toBeVisible();

  if (!(await clickVisibleTeamSection(page, section))) {
    throw new Error(`Cannot open team section "${section}"`);
  }
}

/** The labels of the agent settings lozenges. */
export type AgentSettingsSection =
  | "Job description"
  | "Learnings"
  | "People"
  | "Integrations"
  | "AI Models"
  | "Skills";

const AGENT_SECTION_IDS: Readonly<Record<AgentSettingsSection, string>> = {
  "Job description": "job-description",
  Learnings: "learnings",
  People: "people",
  Integrations: "integrations",
  "AI Models": "models",
  Skills: "skills",
};

export function agentSectionTab(
  page: Page,
  section: AgentSettingsSection,
): Locator {
  return screen(page).locator(
    `[data-agent-section-tab='${AGENT_SECTION_IDS[section]}']`,
  );
}

/**
 * Open one agent's focused screen through its rail row.
 */
export async function openAgentScreen(
  page: Page,
  agentName: string,
): Promise<void> {
  await rail(page)
    .getByRole("button", {
      name: new RegExp(`^${escapeRegExp(agentName)}$`),
    })
    .click();
  await expect(
    screen(page).getByRole("heading", { name: agentName }),
  ).toBeVisible();
}

/** Open one focused agent's settings, optionally drilled to a section. */
export async function openAgentSettings(
  page: Page,
  agentName: string,
  section: AgentSettingsSection = "Job description",
): Promise<void> {
  await openAgentScreen(page, agentName);
  await openTeamSection(page, "Agent settings");
  if (section !== "Job description") {
    await openAgentSettingsSection(page, section);
  }
}

/** Pick a section on an already-open agent settings page. */
export async function openAgentSettingsSection(
  page: Page,
  section: AgentSettingsSection,
): Promise<void> {
  await agentSectionTab(page, section).click();
}
