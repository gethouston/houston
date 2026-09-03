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
 * Where the screen on the glass draws its HEADER cluster.
 *
 * ONE home at every width now: the strip inside the screen. The phone used to
 * portal the cluster into a top bar; that bar retired with the hamburger it
 * carried. Kept as its own helper so the specs keep saying what they mean.
 */
export function headerChrome(page: Page): Locator {
  return screen(page);
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
export type TeamSection = "Tasks" | "Routines" | "Files" | "Team Settings";

/** Section name -> the `data-team-section-tab` value its lozenge carries. */
export const TEAM_SECTION_TAB_IDS: Readonly<Record<TeamSection, string>> = {
  Tasks: "mission-control",
  Routines: "routines",
  Files: "files",
  "Team Settings": "settings",
};

export type TeamSettingsTab = "Context" | "Agents" | "People" | "Settings";

const TEAM_SETTINGS_TAB_IDS: Readonly<Record<TeamSettingsTab, string>> = {
  Context: "context",
  Agents: "agents",
  People: "people",
  Settings: "settings",
};

export function teamSettingsTab(page: Page, tab: TeamSettingsTab): Locator {
  return headerChrome(page).locator(
    `[data-team-settings-tab='${TEAM_SETTINGS_TAB_IDS[tab]}']`,
  );
}

/** The compact replacement for the Team Settings lozenge cluster. */
function teamSettingsSwitcher(page: Page): Locator {
  return headerChrome(page).locator("[data-team-settings-switcher]");
}

/**
 * Open the drilled Team Settings level.
 *
 * Arrival is "one of the two navigation surfaces is drawn", never the Context
 * lozenge alone: the drilled strip collapses into its switcher exactly as the
 * team strip does, and it collapses OFTEN here — a team whose board is empty
 * opens the composer panel beside it, which is enough to cross the threshold.
 */
export async function openTeamSettings(page: Page): Promise<void> {
  await openTeamSection(page, "Team Settings");
  await expect(
    teamSettingsTab(page, "Context").or(teamSettingsSwitcher(page)).first(),
    "the Team Settings navigation should become available",
  ).toBeVisible();
}

/** Pick a tab of the OPEN Team Settings level, in either layout. */
export async function openTeamSettingsSection(
  page: Page,
  tab: TeamSettingsTab,
): Promise<void> {
  const lozenge = teamSettingsTab(page, tab);
  if (await lozenge.isVisible()) {
    await lozenge.click();
    return;
  }
  await teamSettingsSwitcher(page).click();
  await page
    .locator(
      `[role='menuitemcheckbox'][data-team-settings-tab='${TEAM_SETTINGS_TAB_IDS[tab]}']`,
    )
    .click();
}

export async function openArchivedTasks(page: Page): Promise<void> {
  await screen(page).getByRole("button", { name: "Archived" }).click();
}

export async function returnToActiveTasks(page: Page): Promise<void> {
  await screen(page).getByRole("button", { name: "Back to tasks" }).click();
}

/** The team screen's lozenge cluster, on the open team. */
export function teamTabs(page: Page): Locator {
  return headerChrome(page).locator("[data-team-section-tab]");
}

/** One lozenge of the open team, by section. */
export function teamTab(page: Page, section: TeamSection): Locator {
  return headerChrome(page).locator(
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
  return headerChrome(page).locator("[data-team-section-switcher]");
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
 *
 * The rail is a way back only from a TOP-LEVEL view (the Agent Store, the
 * Skills page), where no screen on the glass carries sections at all and the
 * caller is asking to return to a team. It is NEVER a way to recover a section
 * a section-bearing screen failed to offer: clicking a team's row THERE would
 * walk a focused AGENT's screen back to its team's, and the spec that asked
 * for that agent's Files would assert against the whole team's and pass. That
 * case throws, so a spec fails where the navigation actually broke.
 */
export async function openTeamSection(
  page: Page,
  section: TeamSection,
): Promise<void> {
  // Every screen that carries sections carries the home lozenge, in one mode
  // or the other — team screen and focused agent screen alike.
  const sectioned = teamTab(page, "Tasks").or(teamSectionSwitcher(page));
  // `.first()` on every or-chain wait: more than one surface being visible at
  // once (tab cluster on screen AND the team's rail row) is the NORMAL state,
  // and a bare or-chain trips strict mode exactly then. These waits ask "has
  // at least one navigation surface arrived", not "is there exactly one".
  await expect(
    sectioned.or(currentTeamRow(page)).first(),
    `a team navigation surface for "${section}" should become available`,
  ).toBeVisible();

  // The strip re-modes when its width observer reports, and on a slow CI box
  // there is a WINDOW where the tab cluster has unmounted and the compact
  // switcher has not yet arrived — neither control is clickable for a beat.
  // Retry through that window; only a screen that STILL offers no control
  // after real patience is a broken navigation worth failing on.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (await clickVisibleTeamSection(page, section)) return;
    if (!(await sectioned.first().isVisible())) break;
    await page.waitForTimeout(400);
  }

  if (await sectioned.first().isVisible()) {
    throw new Error(
      `Cannot open team section "${section}": the screen on the glass carries sections, but neither that section's lozenge nor the compact switcher was clickable. Coming back through the rail would silently swap a focused agent's screen for its team's.`,
    );
  }

  await currentTeamRow(page).getByRole("button").first().click();
  await expect(
    sectioned.first(),
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
  | "Skills"
  | "Settings";

const AGENT_SECTION_IDS: Readonly<Record<AgentSettingsSection, string>> = {
  "Job description": "job-description",
  Learnings: "learnings",
  People: "people",
  Integrations: "integrations",
  "AI Models": "models",
  Skills: "skills",
  Settings: "manage",
};

export function agentSectionTab(
  page: Page,
  section: AgentSettingsSection,
): Locator {
  return headerChrome(page).locator(
    `[data-agent-section-tab='${AGENT_SECTION_IDS[section]}']`,
  );
}

/**
 * ONE agent's row in the rail.
 *
 * By the row's `title`, not its accessible name: a row that is carrying work
 * ("2 issues need you") folds that count into the button's name, so an exact
 * name match finds the quiet agents and misses the busy ones — precisely the
 * ones a spec arms on purpose. The title is the agent's name and nothing else.
 */
export function agentRow(page: Page, agentName: string): Locator {
  return rail(page).locator(
    `[data-sidebar-item] button[title="${agentName.replace(/"/g, '\\"')}"]`,
  );
}

/**
 * Open one agent's focused screen through its rail row.
 *
 * The arrival check reads the screen's IDENTITY rather than a heading by
 * accessible name: below `TEAM_STRIP_ONE_ROW_MIN` the lozenge cluster collapses
 * into a switcher whose h1 is named for the menu, and the agent's own name
 * survives only as the trigger's content. An empty board opens the composer
 * panel on its own, so the narrow layout is the NORMAL one here, not an edge.
 */
export async function openAgentScreen(
  page: Page,
  agentName: string,
): Promise<void> {
  await agentRow(page, agentName).click();
  await expect(headerChrome(page).locator("[data-agent-screen]")).toContainText(
    agentName,
  );
}

/**
 * Open one focused agent's settings, drilled to a section. Pass `null` to
 * stay on whatever the page lands on by itself (the Settings section — the
 * default lens for a page opened to administer the agent).
 */
export async function openAgentSettings(
  page: Page,
  agentName: string,
  section: AgentSettingsSection | null = "Job description",
): Promise<void> {
  await openAgentScreen(page, agentName);
  // The agent screen wears the same strip as the team screen, so its Settings
  // lozenge collapses into the same switcher: go through whichever is drawn.
  if (!(await clickVisibleTeamSection(page, "Team Settings"))) {
    throw new Error(`Cannot open ${agentName}'s settings`);
  }
  if (section !== null) {
    await openAgentSettingsSection(page, section);
  }
}

/**
 * Pick a section on an already-open agent settings page.
 *
 * The drilled strip collapses too — its cluster becomes
 * `[data-agent-section-switcher]` — so a section is reached through whichever
 * form the width allows.
 */
export async function openAgentSettingsSection(
  page: Page,
  section: AgentSettingsSection,
): Promise<void> {
  const tab = agentSectionTab(page, section);
  if (await tab.isVisible()) {
    await tab.click();
    return;
  }
  await headerChrome(page).locator("[data-agent-section-switcher]").click();
  await page
    .locator(
      `[role='menuitemcheckbox'][data-agent-section-tab='${AGENT_SECTION_IDS[section]}']`,
    )
    .click();
}
