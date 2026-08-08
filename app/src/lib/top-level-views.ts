/**
 * The top-level views: EVERY full-window surface in the app, each reached from
 * the sidebar. `workspace-shell.tsx` renders one of them and nothing else — a
 * `viewMode` outside this set is stale and resets to the dashboard
 * (`use-workspace-view-guards.ts`); `sidebar.tsx` highlights the matching nav
 * item. Both predicates source from this one set so a new top-level view (like
 * the AI hub) can't be added to one and forgotten in the other.
 *
 * Usage, Permissions and Admin are NOT here: they are settings sections now
 * (HOU-788), reached from the Settings index — see `lib/settings-sections.ts`.
 * A read those sections own is therefore active while `settings` is, not while
 * some screen of its own is.
 *
 * The team view is ONE id (`team`) rather than one per team: which team and
 * which of its sections are open is store state (`activeTeamId` /
 * `teamSection`), so every team shares one kept-alive screen and a team the
 * user deletes cannot leave a dead view id behind.
 */
import { INTEGRATIONS_VIEW_ID } from "../components/integrations-view/id.ts";
import { SKILLS_VIEW_ID } from "../components/skills-view/id.ts";
import { STORE_VIEW_ID } from "../components/store-view/id.ts";
import { TEAM_VIEW_ID, type TeamSectionId } from "./teams-model.ts";

export { INTEGRATIONS_VIEW_ID, SKILLS_VIEW_ID, STORE_VIEW_ID, TEAM_VIEW_ID };

export const DASHBOARD_VIEW_ID = "dashboard";
export const SETTINGS_VIEW_ID = "settings";
export const AI_HUB_VIEW_ID = "ai-hub";

export type TopLevelViewId =
  | typeof DASHBOARD_VIEW_ID
  | typeof SETTINGS_VIEW_ID
  | typeof AI_HUB_VIEW_ID
  | typeof INTEGRATIONS_VIEW_ID
  | typeof SKILLS_VIEW_ID
  | typeof STORE_VIEW_ID
  | typeof TEAM_VIEW_ID;

export const TOP_LEVEL_VIEWS = new Set<TopLevelViewId>([
  DASHBOARD_VIEW_ID,
  SETTINGS_VIEW_ID,
  AI_HUB_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  SKILLS_VIEW_ID,
  STORE_VIEW_ID,
  TEAM_VIEW_ID,
]);

/** Whether a `viewMode` names one of the app's screens. */
export function isTopLevelView(viewMode: string): boolean {
  return TOP_LEVEL_VIEWS.has(viewMode as TopLevelViewId);
}

/**
 * Whether a `viewMode` OWNS a cross-agent mission board — the global one, or a
 * team (any section of it). VIEW-level, deliberately coarse: it answers "is
 * there a board on this screen to route to", which is what ⌘N and the command
 * palette need. Both views register the global "New mission" handler when their
 * board mounts, so the shortcut fires it in place instead of routing the user to
 * some other board; missing the team board here would have made ⌘N on a
 * team jump the user out of the team entirely.
 *
 * NOT the predicate for claiming keys. A team view is true here while showing
 * Routines, Files or Team Settings, none of which is a board — for "is a board
 * on the glass right now" use {@link isMissionBoardSurface}.
 */
export function isMissionBoardView(viewMode: string): boolean {
  return viewMode === DASHBOARD_VIEW_ID || viewMode === TEAM_VIEW_ID;
}

/**
 * Whether the surface ON SCREEN is a mission board: the global one, or a team
 * view whose OPEN SECTION is Mission Control. View-level truth is not enough —
 * the team view also renders Routines, Files and Settings, and treating those
 * as a board makes the arrows and Enter `preventDefault()` over surfaces that
 * have no board keys to give, so the list never scrolls and Enter never reaches
 * the focused control: the keys are swallowed in silence.
 *
 * A `null` team section resolves to Mission Control, matching
 * `resolveTeamSection`'s "else the team's first section" (`lib/teams-model.ts`)
 * — keep the two in agreement. A section this caller may not see (Team Settings
 * after a role demotion) also resolves to Mission Control there, but that stale
 * pair reads as "not a board" here, on purpose: erring toward NOT claiming the
 * keys costs one highlight move, erring the other way swallows them again.
 */
export function isMissionBoardSurface(ui: {
  viewMode: string;
  teamSection: TeamSectionId | null;
}): boolean {
  if (ui.viewMode === DASHBOARD_VIEW_ID) return true;
  if (ui.viewMode !== TEAM_VIEW_ID) return false;
  return ui.teamSection === null || ui.teamSection === "mission-control";
}

/** Whether a kept-alive top-level surface is the one currently on screen. */
export function isActiveTopLevelView(
  activeViewMode: string,
  viewId: TopLevelViewId,
): boolean {
  return activeViewMode === viewId;
}

/**
 * Whether a top-level `viewMode` points at a view whose Teams gate is off for
 * this caller (the AI Models hub hides from plain members). The sidebar entry is
 * already hidden, so a STALE `viewMode` (e.g. the role changed on a space switch
 * while the page was open) would otherwise fall through every render branch and
 * strand the user on the shell's engine pane with no way back; the workspace
 * shell resets a blocked view to the dashboard. Pure so the fallback rule is
 * unit-tested.
 */
export function blockedTopLevelView(
  viewMode: string,
  gates: {
    showAiModels: boolean;
  },
): boolean {
  return viewMode === AI_HUB_VIEW_ID && !gates.showAiModels;
}
