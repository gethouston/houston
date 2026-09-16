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
 * The lozenges are on the strip at every DESKTOP width: a narrow strip sends
 * the section's tools to their own row and keeps the cluster, so these helpers
 * address a lozenge and never a menu. The phone reaches a team's sections one
 * level up, through the Teams tree (`mobile-nav.ts`).
 */

/** The rail. Section rows and agent rows both live here. */
export function rail(page: Page): Locator {
  return page.locator("[data-tour-target='agents']");
}

/** The top-level rail rows, by the tour anchor the shell stamps on each. */
export type NavRowId = "integrations" | "ai-hub" | "settings";

/**
 * One top-level rail row — a destination that belongs to nobody.
 *
 * The rail is ONE unlabelled run — the AI Manager, AI Models and Integrations,
 * the destinations a user reaches for without being asked — over "Your teams",
 * with the Academy and Settings in the footer. The shared Skills library is the
 * Skills TAB of the Integrations screen (`settings-nav.ts` `openSkillsLibrary`),
 * not a row here. **The AI Manager and the Academy are deliberately absent from
 * this union**: neither carries a tour anchor, because a target the tour never
 * spotlights is dead weight — address the AI Manager by its own test id
 * (`settings-nav.ts` `assistantRow`).
 *
 * There is NO global mission board among them: every board belongs to a team,
 * so a spec that wants the app's home board asks for
 * {@link openTeamSection}`(page, "Tasks")` instead.
 */
export function navRow(page: Page, id: NavRowId): Locator {
  return page.locator(`[data-tour-target='nav-${id}']`);
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
 * A mission's card on the board that is ON THE GLASS, by its title.
 *
 * The Agents home is where boot waits and where every fallback lands, so it is
 * mounted for the whole session and its rows keep each agent's latest task
 * title in their preview line. A bare `getByText(title)` therefore matches that
 * hidden preview as well as the card — a strict-mode violation, or worse a
 * `.first()` that silently drifts onto the invisible copy. Ask for the CARD:
 * the kanban columns of the screen the user is looking at.
 */
export function missionCard(page: Page, title: string): Locator {
  return screen(page).getByTestId("board-columns").getByText(title);
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

/**
 * Open the drilled Team Settings level.
 *
 * Arrival is the Context lozenge: the drilled strip keeps its cluster at every
 * desktop width — a panel opening beside the board moves the TOOLS to their own
 * row, never the sections.
 */
export async function openTeamSettings(page: Page): Promise<void> {
  await openTeamSection(page, "Team Settings");
  await expect(
    teamSettingsTab(page, "Context"),
    "the Team Settings navigation should become available",
  ).toBeVisible();
}

/** Pick a tab of the OPEN Team Settings level. */
export async function openTeamSettingsSection(
  page: Page,
  tab: TeamSettingsTab,
): Promise<void> {
  await teamSettingsTab(page, tab).click();
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

/** Assert the selected section on the strip. */
export async function expectTeamSectionSelected(
  page: Page,
  section: TeamSection,
): Promise<void> {
  await expect(teamTab(page, section)).toHaveAttribute("aria-current", "page");
}

/** Assert exactly which sections the current team offers. */
export async function expectTeamSections(
  page: Page,
  sections: readonly TeamSection[],
): Promise<void> {
  await expect(teamTabs(page)).toHaveCount(sections.length);
  for (const section of sections)
    await expect(teamTab(page, section)).toBeVisible();
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
 * The rail is a way back only from a TOP-LEVEL view (Integrations, the
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
  // Every screen that carries sections carries the home lozenge — team screen
  // and focused agent screen alike.
  const sectioned = teamTab(page, "Tasks");
  // `.first()` on every or-chain wait: more than one surface being visible at
  // once (tab cluster on screen AND the team's rail row) is the NORMAL state,
  // and a bare or-chain trips strict mode exactly then. These waits ask "has
  // at least one navigation surface arrived", not "is there exactly one".
  await expect(
    sectioned.or(currentTeamRow(page)).first(),
    `a team navigation surface for "${section}" should become available`,
  ).toBeVisible();

  if (!(await sectioned.isVisible())) {
    await currentTeamRow(page).getByRole("button").first().click();
    await expect(
      sectioned,
      `the team section controls should appear after returning to the team`,
    ).toBeVisible();
  }

  // The cluster is one render: the home lozenge and its siblings arrive
  // together, so a section that is not here once the home lozenge is will
  // never be. Asserting rather than probing keeps the one true failure (a
  // sectioned screen that does not offer this section) from hiding behind a
  // `isVisible()` snapshot taken while the screen was still mounting.
  const tab = teamTab(page, section);
  await expect(
    tab,
    `Cannot open team section "${section}": the screen on the glass carries sections, but that section has no lozenge. Coming back through the rail would silently swap a focused agent's screen for its team's.`,
  ).toBeVisible();
  await tab.click();
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

/** The whole agent-settings lozenge cluster, on the screen on the glass. */
export function agentSectionTabs(page: Page): Locator {
  return headerChrome(page).locator("[data-agent-section-tab]");
}

/** The phone's replacement for the full agent-settings lozenge cluster. */
function agentSectionSwitcher(page: Page): Locator {
  return headerChrome(page).locator("[data-agent-section-switcher]");
}

/**
 * Assert exactly which sections an agent's settings page offers, in either
 * layout.
 *
 * Reading the WHOLE cluster is what makes an absence meaningful: a personal
 * space drops the access sections (`agentAccessSections` → `[]`), so "People
 * has no lozenge" must be read against the sections that ARE drawn, never
 * against a bare count of zero. The phone folds the drilled cluster into the
 * back chip's menu, which is the second form below.
 */
export async function expectAgentSettingsSections(
  page: Page,
  sections: readonly AgentSettingsSection[],
): Promise<void> {
  const tabs = agentSectionTabs(page);
  if (await tabs.first().isVisible()) {
    await expect(tabs).toHaveCount(sections.length);
    for (const section of sections)
      await expect(agentSectionTab(page, section)).toBeVisible();
    return;
  }

  const switcher = agentSectionSwitcher(page);
  await expect(switcher).toBeVisible();
  await switcher.click();
  const menuSections = page.locator(
    "[role='menuitemcheckbox'][data-agent-section-tab]",
  );
  await expect(menuSections).toHaveCount(sections.length);
  for (const section of sections) {
    await expect(
      page.locator(
        `[role='menuitemcheckbox'][data-agent-section-tab='${AGENT_SECTION_IDS[section]}']`,
      ),
    ).toBeVisible();
  }
  await page.keyboard.press("Escape");
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
 * The arrival check reads the screen's IDENTITY marker rather than a heading:
 * the marker rides the desktop strip and the phone's drilled header alike, so
 * one wait covers both trees.
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
  // lozenge is addressed the same way.
  const settings = teamTab(page, "Team Settings");
  await expect(settings, `Cannot open ${agentName}'s settings`).toBeVisible();
  await settings.click();
  if (section !== null) {
    await openAgentSettingsSection(page, section);
  }
}

/**
 * Pick a section on an already-open agent settings page.
 *
 * On the phone the drilled cluster folds into `[data-agent-section-switcher]`,
 * so a section is reached through whichever form the breakpoint draws. A
 * section this page does not offer at all (a personal space drops the access
 * sections, `agentAccessSections` → `[]`) is reachable through NEITHER control,
 * and that throws — waiting on a switcher the layout will never draw would
 * spend the whole test budget to report a timeout instead of the missing
 * section.
 */
export async function openAgentSettingsSection(
  page: Page,
  section: AgentSettingsSection,
): Promise<void> {
  // A phone's strip paints its safe collapsed form until the width observer
  // reports, so the cluster can swap forms once between the visibility check
  // and the click. Retry through that window before calling the section
  // genuinely absent.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const tab = agentSectionTab(page, section);
    if (await tab.isVisible()) {
      try {
        await tab.click({ timeout: 5_000 });
        return;
      } catch {
        // Re-moded mid-click: the section moved into the switcher, not away.
      }
    }

    const switcher = agentSectionSwitcher(page);
    if (await switcher.isVisible()) {
      await switcher.click();
      await page
        .locator(
          `[role='menuitemcheckbox'][data-agent-section-tab='${AGENT_SECTION_IDS[section]}']`,
        )
        .click();
      return;
    }
    await page.waitForTimeout(400);
  }

  throw new Error(
    `Cannot open agent settings section "${section}": neither its lozenge nor the phone switcher is on the agent's settings page, so this page does not offer that section at all.`,
  );
}
