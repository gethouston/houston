import type { Agent } from "../../lib/types.ts";

/**
 * Which of a team's agents a section is looking at, resolved from the ONE pin
 * every team surface shares (`teamAgentFilter` in the UI store — an agent id,
 * set by clicking an agent row in the rail or by a section's own dropdown).
 *
 * Two shapes, because the two sections ask different questions:
 *
 * - Routines aggregates, so "no pin" means EVERY agent — `teamScopedAgents`.
 * - Files cannot merge trees, so it always has exactly one agent open —
 *   `teamSelectedAgent`, which falls back to the team's first agent.
 *
 * Both drop a pin naming an agent that is not in this team (dragged out while
 * the section was open), exactly as the board's `resolveFilterPath` does: a
 * filter nobody can see the source of would leave a section empty with no way
 * back.
 *
 * Pure, unit tested in `app/tests/team-agent-choice.test.ts`.
 */

/** The pinned agent when it is still a member of this team, else `null`. */
export function teamPinnedAgent(
  agents: Agent[],
  pinnedId: string | null,
): Agent | null {
  if (!pinnedId) return null;
  return agents.find((a) => a.id === pinnedId) ?? null;
}

/** The agents an AGGREGATING section reads: the pinned one, else all of them. */
export function teamScopedAgents(
  agents: Agent[],
  pinnedId: string | null,
): Agent[] {
  const pinned = teamPinnedAgent(agents, pinnedId);
  return pinned ? [pinned] : agents;
}

/**
 * The ONE agent a single-agent section opens on: the pin when it still
 * resolves, else the team's first agent, else `null` for an empty team.
 */
export function teamSelectedAgent(
  agents: Agent[],
  pinnedId: string | null,
): Agent | null {
  return teamPinnedAgent(agents, pinnedId) ?? agents[0] ?? null;
}
