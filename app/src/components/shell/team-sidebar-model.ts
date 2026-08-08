import type { TeamView } from "../../lib/teams-model.ts";
import type { Agent } from "../../lib/types.ts";

/**
 * The id of the local DRAFT team row. Not a server id and never persisted: it
 * exists between "New team" and the first typed name, so a server host mints
 * nothing until there IS a name to broadcast (`use-server-team-actions.ts`).
 * It lives here, with the rail's other pure team vocabulary, because both the
 * create flow and the drag writes have to recognize it and neither owns it.
 */
export const DRAFT_TEAM_ID = "team:draft";

/**
 * The agents the rail is allowed to DRAW, given the teams it draws.
 *
 * The grouped list puts every item no group claims into the trailing default
 * block (`computeSidebarSections`), so handing it the whole agent store while
 * drawing only the JOINED teams would spill a public team's agents into the
 * default team's leftovers: agents the caller can see but whose team is
 * deliberately filed away under "Other teams". Narrowing the input is what keeps
 * that block honest.
 *
 * Returns the SAME array when nothing is excluded, so the local backend (where
 * every team is joined and every agent belongs to one) is untouched down to
 * object identity, and the memoized structures derived from it never
 * needlessly recompute.
 */
export function agentsInTeams(
  agents: Agent[],
  teams: readonly TeamView[],
): Agent[] {
  const held = new Set<string>();
  for (const team of teams) {
    for (const agent of team.agents) held.add(agent.id);
  }
  const kept = agents.filter((agent) => held.has(agent.id));
  return kept.length === agents.length ? agents : kept;
}
