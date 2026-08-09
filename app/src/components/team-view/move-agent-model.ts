import type { ItemDest } from "../../lib/sidebar-layout-ops.ts";
import { DEFAULT_TEAM_ID, type TeamView } from "../../lib/teams-model.ts";

/**
 * The pure rules behind "Move to team": which teams an agent can be moved TO,
 * and where a move lands on the local backend.
 *
 * Cross-team DRAG is gone from the rail, so this action is the only way an
 * agent changes teams. It has to answer the same question on both backends,
 * which is exactly why the two rules are pure and unit-tested here
 * (`app/tests/move-agent-model.test.ts`) rather than inlined in the menu.
 */

/**
 * The teams a move can offer: every team the workspace has EXCEPT the one the
 * agent is already in. An empty result means the workspace has nowhere to move
 * this agent, and the caller draws no action at all rather than a menu whose
 * only honest content is "nothing here".
 *
 * Order is the rail's own (the order `useTeams()` resolves), so the picker
 * lists teams the way the user already reads them.
 */
export function moveTargetTeams(
  teams: readonly TeamView[],
  currentTeamId: string,
): TeamView[] {
  return teams.filter((team) => team.id !== currentTeamId);
}

/**
 * Where a move lands in the STORED LAYOUT (the local backend, where the layout
 * IS the model). The virtual default team owns no group row, so it is the
 * layout's `null` section; every named team is its own group id.
 *
 * Getting this wrong is silent: keyed by the `DEFAULT_TEAM_ID` sentinel the
 * write mints a group nothing renders, and the agent disappears from the rail
 * until the layout is rewritten. `beforeItemId` is `null` because a move
 * APPENDS -- the user picked a team, not a position in it.
 *
 * Server-backed the move is a `PUT /v1/agents/:slug/team` instead and this rule
 * is not consulted: there the default team wears a real server id.
 */
export function localMoveDest(team: TeamView): ItemDest {
  return {
    groupId: team.id === DEFAULT_TEAM_ID ? null : team.id,
    beforeItemId: null,
  };
}
