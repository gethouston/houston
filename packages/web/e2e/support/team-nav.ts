import type { Locator, Page } from "@playwright/test";

/**
 * Navigating the teams shell, for specs that used to click an agent tab.
 *
 * The per-agent tab strip is gone: an agent's WORK is a section of its team
 * (Tasks / Routines / Files, reached from the TEAM SCREEN's own tab row) and an
 * agent's CONFIGURATION is the canonical settings page, reached through the
 * team's "Manage agents" tab — the ONE door onto it, in every deployment.
 * These helpers are the one place those two paths are spelled out, so a spec
 * says what it wants ("open Files", "open this agent's Skills") instead of
 * re-deriving the route.
 *
 * The rail names TEAMS; the tab row names a team's SECTIONS. Nothing in the
 * rail switches sections any more.
 *
 * English is forced by the boot seed, so label selectors are stable.
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
  | "Archived"
  | "Manage agents";

/** Section name -> the `data-team-section-tab` value its lozenge carries. */
export const TEAM_SECTION_TAB_IDS: Readonly<Record<TeamSection, string>> = {
  Tasks: "mission-control",
  Routines: "routines",
  Files: "files",
  Archived: "archived",
  "Manage agents": "settings",
};

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
  await teamTab(page, section).click();
}

/** The sections of the agent settings rail, as it labels them. */
export type AgentSettingsSection =
  | "Job description"
  | "Memory"
  | "People with access"
  | "Apps"
  | "AI models"
  | "Skills";

/**
 * Open ONE agent's settings page: the team's "Manage agents" section, then the
 * agent's row. `section` picks a rail entry once the page is up; omit it to land
 * on the page's default (People with access).
 */
export async function openAgentSettings(
  page: Page,
  agentName: string,
  section?: AgentSettingsSection,
): Promise<void> {
  await openTeamSection(page, "Manage agents");
  await screen(page)
    .getByRole("button", { name: new RegExp(escapeRegExp(agentName)) })
    .first()
    .click();
  if (section) await openAgentSettingsSection(page, section);
}

/** Pick a section on an already-open agent settings page. */
export async function openAgentSettingsSection(
  page: Page,
  section: AgentSettingsSection,
): Promise<void> {
  // Not `exact`: Learnings and People carry a count badge inside the button,
  // so the accessible name is "Memory 3", not "Memory".
  await page
    .getByRole("navigation", { name: "Agent settings sections" })
    .getByRole("button", { name: new RegExp(`^${escapeRegExp(section)}`) })
    .click();
}
