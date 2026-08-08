import type { Locator, Page } from "@playwright/test";

/**
 * Navigating the teams shell, for specs that used to click an agent tab.
 *
 * The per-agent tab strip is gone: an agent's WORK is a section of its team
 * (Mission Control / Routines / Files, reached from the rail) and an agent's
 * CONFIGURATION is the canonical settings page, reached through Team Settings.
 * These helpers are the one place those two paths are spelled out, so a spec
 * says what it wants ("open Files", "open this agent's Skills") instead of
 * re-deriving the route.
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

/**
 * The screen ON THE GLASS.
 *
 * Every top-level view is kept alive, so several screens sit in the DOM at
 * once and only one is displayed. A bare page-level lookup therefore matches
 * the hidden ones too (a mission card exists on Mission Control AND on its
 * team's board), which is a strict-mode violation at best and a click on an
 * invisible element at worst. Scope board and section lookups through this.
 */
export function screen(page: Page): Locator {
  return page.locator("[data-screen-active='true']");
}

/** The team section rows, as the rail labels them. */
export type TeamSection =
  | "Mission Control"
  | "Routines"
  | "Files"
  | "Team Settings";

/**
 * Open a team's section. With no team name the FIRST matching row is used,
 * which in the seeded workspace is the default team (the workspace itself) —
 * the only team a spec has unless it made another.
 */
export async function openTeamSection(
  page: Page,
  section: TeamSection,
): Promise<void> {
  await rail(page)
    .locator("[data-sidebar-section-row]")
    .filter({ hasText: section })
    .first()
    .click();
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
 * Open ONE agent's settings page: Team Settings, then its row. `section` picks
 * a rail entry once the page is up; omit it to land on the page's default.
 */
export async function openAgentSettings(
  page: Page,
  agentName: string,
  section?: AgentSettingsSection,
): Promise<void> {
  await openTeamSection(page, "Team Settings");
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
