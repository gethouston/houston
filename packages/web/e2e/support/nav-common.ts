import type { Locator, Page } from "@playwright/test";

/**
 * Navigation helpers for employee screens. Each employee's screen owns its
 * Tasks, Routines, Files, and Settings sections.
 *
 * English is forced by the boot seed, so label selectors are stable.
 *
 * The lozenges are on the strip at every DESKTOP width: a narrow strip sends
 * the section's tools to their own row and keeps the cluster, so these helpers
 * address a lozenge and never a menu. The phone reaches an employee's sections
 * through its task list menu (`mobile-nav.ts`).
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
 * The rail is ONE unlabelled run — the AI Manager, AI Models, Integrations and
 * Skills, the destinations a user reaches for without being asked — over "Your
 * AI Employees", with the Academy and Settings in the footer. **The AI Manager, Skills
 * and the Academy are deliberately absent from this union**: none carries a
 * tour anchor, because a target the tour never spotlights is dead weight —
 * address the AI Manager and Skills by their own test ids (`settings-nav.ts`
 * `assistantRow` / `skillsRow`).
 *
 * Every board belongs to an employee, so a spec that wants the desktop landing
 * board asks for
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
 * the hidden ones too (a task title appears on Tasks and in an Agents home
 * preview), which is a strict-mode violation at best and a click on an
 * invisible element at worst. Scope board and section lookups through this.
 */
export function screen(page: Page): Locator {
  return page.locator("[data-screen-active='true']");
}

/**
 * A mission's card on the board that is ON THE GLASS, by its title.
 *
 * Agents home stays mounted for the session and its rows keep each agent's latest task
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
 * The header cluster lives in the screen at every width.
 */
export function headerChrome(page: Page): Locator {
  return screen(page);
}

/**
 * Narrow a set of rail rows to the one(s) saying "you are here".
 *
 * Every row in the rail is a root element carrying the row's identity (its
 * `data-sidebar-*` attributes, its tour anchor) wrapped around an inner
 * `<button>`, and `aria-current="page"` lives on that button — the affordance
 * beside it, a "..." menu or a "+", is a SIBLING and may not be nested in it.
 * So "is this row the current one?" is a question about what the row CONTAINS,
 * never an attribute of the row itself.
 */
export function litRows(rows: Locator): Locator {
  return rows.filter({ has: rows.page().locator("[aria-current='page']") });
}
