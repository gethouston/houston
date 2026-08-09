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
 * there: its name is the space's own. Two doors offer it — Team Settings' name
 * field and the default block's own rail menu — and both read THIS gate, so a
 * caller who may not rename it sees neither.
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
 *
 * And never in a PERSONAL space. That space holds one human, who therefore
 * created every team in it and holds an owner row nothing can remove, so
 * `joined` is true there forever and the joined test alone would offer Leave on
 * every team — onto a `403 personal_space`. Leaving is the third people route
 * the gateway refuses there, beside join and the member writes, so it hides for
 * exactly the reason the Members card does.
 */
export function canLeaveTeam(
  team: TeamView,
  /** Whether the ACTIVE space is a personal one (`usePersonalSpace`). */
  personalSpace: boolean,
): boolean {
  return !personalSpace && team.server?.joined === true && !team.isDefault;
}
