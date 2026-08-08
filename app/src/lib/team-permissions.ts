import type { Capabilities } from "@houston-ai/engine-client";
import { canSeeMembers, isMultiplayer } from "./org-roles.ts";
import type { TeamView } from "./teams-model.ts";

/**
 * "May I do this to a team?" — every authority gate the rail's group menu and
 * Team Settings read (C13). Split out of `teams-model.ts` for the file-size
 * rule and re-exported from it, so callers keep importing them from the one
 * team model.
 *
 * Each answers the same question twice, because there are two backends: with no
 * `server` facts the team is a LOCAL sidebar group and the rules are the ones
 * that shipped before C13 (only the virtual default team is special); with them
 * the SERVER's `owner`/`joined` decide, and the client never re-derives either
 * (an org owner/admin reads `owner: true` on every team; everyone reads
 * `joined: true` on the default one). Affordance gates only — the gateway is
 * the sole enforcer, and every one of these rejections is also handled as an
 * expected state (`agent-team-errors.ts`).
 */

/**
 * Whether the caller may open Team Settings ANYWHERE — the ORG-WIDE half of the
 * gate, and the only one here that predates C13 (it reads caps, not a team).
 * Single-player: always (the solo user is the team's owner). Multiplayer: org
 * owner/admin, who are implicit owners of every team.
 *
 * This alone is not the section's gate — see `visibleTeamSectionsForTeam`,
 * which also lets in a member who manages an agent of the team in hand, and
 * which on a server-teams host replaces this half with the server's own
 * per-team `owner`.
 */
export function canSeeTeamSettings(caps: Capabilities | null): boolean {
  return !isMultiplayer(caps) || canSeeMembers(caps);
}

/**
 * May the caller RENAME this team? Locally a rename edits your own sidebar
 * group, which the virtual default team is not (it wears the workspace's name).
 * On a server host it is a team-owner power, and the default team IS renamable
 * there: its name is the space's own, and Team Settings is the only place that
 * offers the field, since the default block deliberately carries no rail menu.
 */
export function canRenameTeam(team: TeamView): boolean {
  return team.server ? team.server.owner : !team.isDefault;
}

/**
 * May the caller DELETE this team? The default team is undeletable on both
 * backends: locally it is virtual (nothing to delete), and the wire answers
 * `400 default_team`. On a server host deleting is additionally a team-owner
 * power.
 */
export function canDeleteTeam(team: TeamView): boolean {
  return team.server ? team.server.owner && !team.isDefault : !team.isDefault;
}

/**
 * May the caller LEAVE this team? A server-host power only: locally a team is
 * the caller's own grouping, so there is no membership to give up. Never on the
 * default team, which everyone in the space belongs to by definition (the wire
 * answers `400 default_team`).
 */
export function canLeaveTeam(team: TeamView): boolean {
  return team.server?.joined === true && !team.isDefault;
}

/**
 * May the caller JOIN this team? A server-host power only, offered on the teams
 * they have not joined (the ones the rail files under "Other teams"). Joining
 * pins the team to the rail; it grants nothing, since the gateway already
 * decides which of the team's agents this caller may see.
 */
export function canJoinTeam(team: TeamView): boolean {
  return team.server?.joined === false;
}
