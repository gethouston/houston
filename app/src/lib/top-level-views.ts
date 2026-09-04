/**
 * The top-level views: EVERY full-window surface in the app, each reached from
 * the sidebar. `workspace-shell.tsx` renders one of them and nothing else — a
 * `viewMode` outside this set is stale and resets to the first team's Mission
 * Control (`use-workspace-view-guards.ts`); `sidebar.tsx` highlights the
 * matching nav item. Both predicates source from this one set so a new
 * top-level view (like the AI hub) can't be added to one and forgotten in the
 * other.
 *
 * There is no GLOBAL mission board any more. Every board belongs to a team, so
 * the app's home is the FIRST team's Mission Control and the only screen that
 * needs no team is the Inbox — which is why the Inbox is where boot waits and
 * where every fallback lands when no team has resolved.
 *
 * Admin is here, in the rail's "Workspace" band, and About me and the Academy
 * are here under the Inbox: none of them is a preference, so none of them is a
 * Settings section. Each owns
 * the whole window, and a read one of them owns is active while ITS OWN screen
 * is — not while `settings` is. Settings itself is general preferences plus
 * Danger, nothing else (`lib/settings-sections.ts`).
 *
 * There is no top-level Permissions view any more. It listed the space's agents
 * so an admin could open one's settings page, which is exactly what every
 * team's focused agent screen already does, per team, in every deployment:
 * agent policy is DISCOVERED through the team that owns the agent. Time worked
 * is gone from here too — it is a lens inside Admin > Analytics now, beside the
 * activity feed and the usage bars it was always read against.
 *
 * The team view is ONE id (`team`) rather than one per team: which team and
 * which of its sections are open is store state (`activeTeamId` /
 * `teamSection`), so every team shares one kept-alive screen and a team the
 * user deletes cannot leave a dead view id behind.
 */
import { ABOUT_ME_VIEW_ID } from "../components/about-me/id.ts";
import { ACADEMY_VIEW_ID } from "../components/academy/id.ts";
import { AGENTS_HOME_VIEW_ID } from "../components/agents-home/id.ts";
import { INTEGRATIONS_VIEW_ID } from "../components/integrations-view/id.ts";
import { ORGANIZATION_VIEW_ID } from "../components/organization/id.ts";
import { SKILLS_VIEW_ID } from "../components/skills-view/id.ts";
import { STORE_VIEW_ID } from "../components/store-view/id.ts";
import { TEAMS_HOME_VIEW_ID } from "../components/teams-home/id.ts";
import { TEAM_VIEW_ID, type TeamSectionId } from "./teams-model.ts";

export {
  ABOUT_ME_VIEW_ID,
  ACADEMY_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  ORGANIZATION_VIEW_ID,
  SKILLS_VIEW_ID,
  STORE_VIEW_ID,
  TEAM_VIEW_ID,
  TEAMS_HOME_VIEW_ID,
};

export const INBOX_VIEW_ID = "inbox";
export const SETTINGS_VIEW_ID = "settings";
export const AI_HUB_VIEW_ID = "ai-hub";

export type TopLevelViewId =
  | typeof INBOX_VIEW_ID
  | typeof ABOUT_ME_VIEW_ID
  | typeof ACADEMY_VIEW_ID
  | typeof AGENTS_HOME_VIEW_ID
  | typeof SETTINGS_VIEW_ID
  | typeof AI_HUB_VIEW_ID
  | typeof INTEGRATIONS_VIEW_ID
  | typeof ORGANIZATION_VIEW_ID
  | typeof SKILLS_VIEW_ID
  | typeof STORE_VIEW_ID
  | typeof TEAM_VIEW_ID
  | typeof TEAMS_HOME_VIEW_ID;

export const TOP_LEVEL_VIEWS = new Set<TopLevelViewId>([
  INBOX_VIEW_ID,
  ABOUT_ME_VIEW_ID,
  ACADEMY_VIEW_ID,
  AGENTS_HOME_VIEW_ID,
  SETTINGS_VIEW_ID,
  AI_HUB_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  ORGANIZATION_VIEW_ID,
  SKILLS_VIEW_ID,
  STORE_VIEW_ID,
  TEAM_VIEW_ID,
  TEAMS_HOME_VIEW_ID,
]);

/** Whether a `viewMode` names one of the app's screens. */
export function isTopLevelView(viewMode: string): boolean {
  return TOP_LEVEL_VIEWS.has(viewMode as TopLevelViewId);
}

/**
 * Whether a `viewMode` OWNS a cross-agent mission board. VIEW-level,
 * deliberately coarse: it answers "is there a board on this screen to route
 * to", which is what ⌘N and the command palette need. The team view registers
 * the global "New mission" handler when its board mounts, so the shortcut fires
 * it in place instead of routing the user to some other board.
 *
 * NOT the predicate for claiming keys. A team view is true here while showing
 * Routines, Files or Team Settings, none of which is a board — for "is a board
 * on the glass right now" use {@link isMissionBoardSurface}.
 */
export function isMissionBoardView(viewMode: string): boolean {
  return viewMode === TEAM_VIEW_ID;
}

/**
 * Whether the surface ON SCREEN is a mission board: a team view whose OPEN
 * SECTION is Mission Control. View-level truth is not enough —
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
 * Whether a top-level `viewMode` points at a view whose gate is off for this
 * caller: the AI Models hub hides from plain members, and Admin is multiplayer
 * owner/admin territory in a TEAM space. The sidebar entry is already hidden,
 * so a STALE `viewMode` (the role changed on a space switch, or the install
 * moved off the hosted cloud, while the page was open) would otherwise fall
 * through every render branch and strand the user on the shell's engine pane
 * with no way back; the workspace shell sends a blocked view home. Pure so the
 * fallback rule is unit-tested.
 *
 * Callers must only act on this once the gates have RESOLVED (`ready` in
 * `useSurfaceGates`): capabilities are null while they load and every gate reads
 * false then, so deciding early would bounce a legitimate view on every space
 * switch — the exact window a team-space switch opens, since it drops the
 * capabilities query.
 */
export function blockedTopLevelView(
  viewMode: string,
  gates: {
    showAiModels: boolean;
    showOrganization: boolean;
  },
): boolean {
  if (viewMode === AI_HUB_VIEW_ID) return !gates.showAiModels;
  if (viewMode === ORGANIZATION_VIEW_ID) return !gates.showOrganization;
  return false;
}
