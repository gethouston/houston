import type { Capabilities, SidebarLayout } from "@houston-ai/engine-client";
import { resolveSidebarSections } from "./agent-order.ts";
import { canSeeMembers, isMultiplayer } from "./org-roles.ts";
import type { Agent } from "./types.ts";

/** The `viewMode` value the team view renders under (see `stores/ui.ts`). */
export const TEAM_VIEW_ID = "team";

/**
 * The virtual default team: the workspace itself, wearing the workspace's
 * name. It is not stored anywhere — agents outside every sidebar group belong
 * to it, exactly as they belong to `ungroupedOrder` on the wire.
 */
export const DEFAULT_TEAM_ID = "team:default";

export type TeamSectionId =
  | "mission-control"
  | "routines"
  | "files"
  | "settings";

/** One sidebar team: a named home for agents and the people who use them. */
export interface TeamView {
  /** `DEFAULT_TEAM_ID` for the virtual default team, else the group id. */
  id: string;
  name: string;
  /** Members in drag order (the same order the sections derive from). */
  agents: Agent[];
  isDefault: boolean;
}

/**
 * Derive the sidebar's teams from the stored layout. Named groups become
 * teams in display order; the trailing default team is the workspace itself
 * (its name = the workspace name) and holds every ungrouped agent — so every
 * agent belongs to exactly one team without any stored-layout migration.
 * The default team renders even when empty: it is the workspace's home team.
 */
export function resolveTeams(
  agents: Agent[],
  layout: SidebarLayout,
  workspaceName: string,
): TeamView[] {
  const { groups, ungrouped } = resolveSidebarSections(agents, layout);
  const named = groups.map(({ group, agents: members }) => ({
    id: group.id,
    name: group.name,
    agents: members,
    isDefault: false,
  }));
  return [
    ...named,
    {
      id: DEFAULT_TEAM_ID,
      name: workspaceName,
      agents: ungrouped,
      isDefault: true,
    },
  ];
}

/** The team with this id, `null` for an unknown id or no id at all. */
export function teamById(
  teams: TeamView[],
  id: string | null,
): TeamView | null {
  if (id === null) return null;
  return teams.find((t) => t.id === id) ?? null;
}

/** The team that owns an agent (every agent belongs to exactly one team). */
export function teamOfAgent(
  teams: TeamView[],
  agentId: string,
): TeamView | null {
  return teams.find((t) => t.agents.some((a) => a.id === agentId)) ?? null;
}

/**
 * Whether the caller may open Team Settings. Single-player: always (the solo
 * user is the team's owner). Multiplayer v1: org owner/admin — they are
 * implicit owners of every team (C13); per-team explicit owners arrive with
 * the server-backed teams surface.
 */
export function canSeeTeamSettings(caps: Capabilities | null): boolean {
  return !isMultiplayer(caps) || canSeeMembers(caps);
}

/**
 * The sections a team offers this caller, in render order. The ONE list the
 * sidebar's section rows and the team view itself read, so a section can never
 * exist in the rail and be unreachable in the view (or the reverse).
 *
 * Mission Control, Routines and Files are every member's: they are the team's
 * WORK, and a member who may use the team's agents may see what those agents
 * do on their own and what they keep. Only Team Settings is gated, because it
 * is the only section that CONFIGURES rather than shows.
 */
export function visibleTeamSections(
  caps: Capabilities | null,
): TeamSectionId[] {
  return [
    "mission-control",
    "routines",
    "files",
    ...(canSeeTeamSettings(caps) ? (["settings"] as const) : []),
  ];
}

/**
 * Whether a section actually narrows to the shared agent pin.
 *
 * Mission Control filters its board by it, Routines scopes its fan-out to it,
 * and Files opens the pinned agent's tree. Team SETTINGS does not: it lists
 * every agent in the team whatever the pin says, on purpose — you go there to
 * manage the team, not one member. So the rail must not fill an agent row while
 * Settings is open: a lit row would claim a narrowing that nothing on screen is
 * doing, and clicking it again would look like a no-op.
 */
export function sectionHonorsAgentPin(section: TeamSectionId | null): boolean {
  return section !== null && section !== "settings";
}

/**
 * The section the team view ACTUALLY renders: the requested one when this
 * caller can see it, else the team's first section (Mission Control). One rule
 * absorbs every stale-store case — no section chosen yet, and Team Settings
 * requested by someone whose role no longer allows it (a space switch demotes
 * them while the view is open).
 */
export function resolveTeamSection(
  sections: readonly TeamSectionId[],
  requested: TeamSectionId | null,
): TeamSectionId {
  return requested && sections.includes(requested) ? requested : sections[0];
}

/**
 * Whether the open team view points at a team that no longer resolves — its
 * sidebar group was deleted, or the workspace it belonged to is gone. Such a
 * `viewMode` would otherwise fall through every render branch and strand the
 * user on an empty pane, so the workspace shell resets it to the dashboard.
 * Pure, mirroring `blockedTopLevelView`, so the fallback rule is unit-tested.
 */
export function blockedTeamView(
  viewMode: string,
  teams: TeamView[],
  activeTeamId: string | null,
): boolean {
  if (viewMode !== TEAM_VIEW_ID) return false;
  return teamById(teams, activeTeamId) === null;
}
