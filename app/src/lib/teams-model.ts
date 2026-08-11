import type { SidebarLayout } from "@houston-ai/engine-client";
import { resolveSidebarSections } from "./agent-order.ts";
import { canDeleteTeam as mayDeleteTeam } from "./team-permissions.ts";
import type { Agent } from "./types.ts";

export {
  canConfigureTeam,
  canConfigureTeamsByRole,
  canDeleteTeam,
  canLeaveTeam,
  canRenameTeam,
} from "./team-permissions.ts";
export {
  resolveTeamSection,
  sectionHonorsAgentPin,
  type TeamPeopleFace,
  type TeamSectionId,
  teamPeopleFace,
  visibleAgentSections,
  visibleTeamSectionsForTeam,
  visibleTeamSettingsSections,
} from "./team-sections.ts";

/** The `viewMode` value the team view renders under (see `stores/ui.ts`). */
export const TEAM_VIEW_ID = "team";

/**
 * The virtual default team: the workspace itself. It is not stored anywhere —
 * agents outside every sidebar group belong
 * to it, exactly as they belong to `ungroupedOrder` on the wire.
 */
export const DEFAULT_TEAM_ID = "team:default";

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

/**
 * One sidebar team: a named home for agents and the people who use them.
 *
 * `icon` and `color` sit at the TOP level, not inside {@link ServerTeamFacts}:
 * a team's identity exists on BOTH backends (locally it is stored on the named
 * group), while the server facts are precisely what exists on only one.
 */
export interface TeamView {
  /** `DEFAULT_TEAM_ID` for the virtual default team, else the group id. */
  id: string;
  name: string;
  /** Members in drag order (the same order the sections derive from). */
  agents: Agent[];
  isDefault: boolean;
  /** Display-only marker for an untouched default identity. Renderers replace
   *  the stored/seed name with their localized "New Team" label and use the
   *  default rocket/charcoal glyph. The real name remains available for writes. */
  usesDefaultIdentity?: true;
  /** The team's glyph NAME, from the CLIENT's own vocabulary
   *  (`shell:sidebar.teamIcons.*`), never an image and never a list the gateway
   *  curates: it validates SHAPE only. ABSENT when unset, which tells the rail
   *  to draw its own default. */
  icon?: string;
  /** A palette id / theme token name, or a literal `#rrggbb`. ABSENT when
   *  unset, exactly like {@link icon}. */
  color?: string;
  /**
   * The team's shared CONTEXT: prose every agent of the team is given before it
   * starts a turn. Locally it is the named group's stored `context`, mirrored to
   * each member agent's `GROUP.md` by the host on the layout write; on a server
   * host it is the gateway's own column.
   *
   * ABSENCE means two different things, and the ONE reader
   * (`teamContextSource`) branches on the backend before it looks: locally it
   * only means nobody has written one yet, while on a SERVER team it means the
   * gateway does not serve the field at all, which is how the editor stays
   * hidden on a gateway that predates it. The virtual default team never
   * carries it — it owns no row on either backend.
   */
  context?: string;
  /** Server truth for this team, on an `agentTeams` host only. Absent on the
   *  local backend, which is what leaves every rule here untouched. */
  server?: ServerTeamFacts;
}

/**
 * Derive the sidebar's teams from the stored layout. Named groups become
 * teams in display order; the trailing default team is the workspace itself
 * and holds every ungrouped agent — so every
 * agent belongs to exactly one team without any stored-layout migration.
 * The default team renders even when empty: it is the workspace's home team.
 *
 * A named team's `icon`/`color`/`context` are copied off its stored group,
 * spread only when present so an unset one stays ABSENT. The VIRTUAL default
 * team gets none of them: it owns no stored group row to hold them, exactly as
 * it owns no `collapsed` of its own.
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
    ...(group.icon === undefined ? {} : { icon: group.icon }),
    ...(group.color === undefined ? {} : { color: group.color }),
    ...(group.context === undefined ? {} : { context: group.context }),
  }));
  return [
    ...named,
    {
      id: DEFAULT_TEAM_ID,
      name: workspaceName,
      agents: ungrouped,
      isDefault: true,
      usesDefaultIdentity: true,
    },
  ];
}

/** Localized display name without replacing the real name used by writes. */
export function teamDisplayName(team: TeamView, newTeamLabel: string): string {
  return team.usesDefaultIdentity ? newTeamLabel : team.name;
}

export type TeamDeletePresentation =
  | "disabled-only-team"
  | "enabled"
  | "hidden";

/** Settings keeps the sole team's Delete row visible but unavailable. */
export function teamDeletePresentation(
  teams: readonly TeamView[],
  team: TeamView,
): TeamDeletePresentation {
  if (teams.length === 1) return "disabled-only-team";
  return mayDeleteTeam(team) ? "enabled" : "hidden";
}

/** The team with this id, `null` for an unknown id or no id at all. */
export function teamById(
  teams: TeamView[],
  id: string | null,
): TeamView | null {
  if (id === null) return null;
  return teams.find((t) => t.id === id) ?? null;
}

/**
 * HOME: the team whose Mission Control the app opens on, and where every
 * fallback lands. `null` means no team has resolved yet (no workspace, or a
 * server-teams read still in flight), which is the one case the callers answer
 * with the Inbox instead.
 *
 * The FIRST team, because `teams` arrives in rail order: home is the top of the
 * user's own sidebar, not an alphabetical or server-internal pick. There is no
 * global mission board any more, so this is the whole of "where does the app
 * start" — see `lib/home-nav.ts` for the imperative half.
 */
export function homeTeam(teams: TeamView[]): TeamView | null {
  return teams[0] ?? null;
}

/** The team that owns an agent (every agent belongs to exactly one team). */
export function teamOfAgent(
  teams: TeamView[],
  agentId: string,
): TeamView | null {
  return teams.find((t) => t.agents.some((a) => a.id === agentId)) ?? null;
}

/**
 * Whether the open team view points at a team that no longer resolves — its
 * sidebar group was deleted, or the workspace it belonged to is gone. Such a
 * `viewMode` would otherwise fall through every render branch and strand the
 * user on an empty pane, so the workspace shell resets it to the dashboard.
 * Pure, mirroring `blockedTopLevelView`, so the fallback rule is unit-tested.
 *
 * "No longer resolves" is the WHOLE rule, on both backends. It deliberately
 * does NOT ask about membership: the gateway now serves a caller only the teams
 * they are part of, so every team in hand is one they may already see, and the
 * gateway is the only thing that decides that.
 */
export function blockedTeamView(
  viewMode: string,
  teams: TeamView[],
  activeTeamId: string | null,
): boolean {
  if (viewMode !== TEAM_VIEW_ID) return false;
  return teamById(teams, activeTeamId) === null;
}
