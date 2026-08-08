import type { Capabilities, SidebarLayout } from "@houston-ai/engine-client";
import { isAgentManager } from "./agent-access.ts";
import { resolveSidebarSections } from "./agent-order.ts";
import { canSeeTeamSettings } from "./team-permissions.ts";
import type { Agent } from "./types.ts";

// The "may I do this to a team?" gates live in their own module (the 200-line
// rule), re-exported here so `teams-model` stays the ONE door onto a team's
// rules for every caller.
export {
  canDeleteTeam,
  canJoinTeam,
  canLeaveTeam,
  canRenameTeam,
  canSeeTeamSettings,
} from "./team-permissions.ts";

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

/**
 * What the SERVER says about the caller's standing in one team (C13). Present
 * ONLY on an `agentTeams` host: its absence is exactly what keeps every rule
 * below byte-identical on the local `sidebar_layout` backend.
 */
export interface ServerTeamFacts {
  joined: boolean;
  owner: boolean;
  memberCount: number;
  sortOrder: number;
}

/** One sidebar team: a named home for agents and the people who use them. */
export interface TeamView {
  /** `DEFAULT_TEAM_ID` for the virtual default team, else the group id. */
  id: string;
  name: string;
  /** Members in drag order (the same order the sections derive from). */
  agents: Agent[];
  isDefault: boolean;
  /** Server truth for this team, on an `agentTeams` host only. Absent on the
   *  local backend, which is what leaves every rule here untouched. */
  server?: ServerTeamFacts;
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
 * The sections THIS team offers this caller, in render order. The ONE list the
 * sidebar's section rows and the team view itself read, so a section can never
 * exist in the rail and be unreachable in the view (or the reverse). It is per
 * TEAM, not per caller: the same person may configure one team and only use the
 * next, so the rail asks it again for every block it draws.
 *
 * Mission Control, Routines and Files are every member's: they are the team's
 * WORK, and a member who may use the team's agents may see what those agents do
 * on their own and what they keep. Team Settings is the only section that
 * CONFIGURES rather than shows, so it goes to anyone who may configure
 * SOMETHING in this team: the org owner/admin (implicit owner of every team) or
 * a member who manages at least one of THIS team's agents. It is also the only
 * door to the agent settings page, so gating it org-wide would have taken every
 * configure surface away from an agent's own manager.
 *
 * On a SERVER-teams host the client-derived org-role half is REPLACED by the
 * server's own `owner` for this team: it already folds in the org owner/admin
 * (implicit owner of every team) and adds the explicit team owner, who
 * configures their team without being an org admin. The agent-manager clause is
 * untouched, so a member who manages one of the team's agents still gets in.
 */
export function visibleTeamSectionsForTeam(
  caps: Capabilities | null,
  team: TeamView,
): TeamSectionId[] {
  const configures =
    (team.server ? team.server.owner : canSeeTeamSettings(caps)) ||
    team.agents.some((agent) => isAgentManager(caps, agent));
  return [
    "mission-control",
    "routines",
    "files",
    ...(configures ? (["settings"] as const) : []),
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
 *
 * "No longer resolves" is the WHOLE rule, on both backends. Not being a member
 * of a server team is deliberately NOT blocking: joining is sidebar PINNING and
 * it grants nothing (C13's first non-negotiable), so every team the gateway
 * lists is one this caller may ALREADY see, and the gateway is the only thing
 * that decides that. Blocking on `joined` made every jump to an agent that
 * lives in an unjoined team dead-end on the dashboard — `agentDestination`
 * resolved the right team and this guard threw the user straight off it. The
 * rail still lists unjoined teams under "Other teams" rather than in "Your
 * teams", which is what joining changes and all it changes.
 */
export function blockedTeamView(
  viewMode: string,
  teams: TeamView[],
  activeTeamId: string | null,
): boolean {
  if (viewMode !== TEAM_VIEW_ID) return false;
  return teamById(teams, activeTeamId) === null;
}
