import type { Agent } from "../../lib/types.ts";

/**
 * A mission card's OWNING agent, resolved from the workspace roster by the one
 * key every card carries: `agent_path`.
 *
 * **Why not the row's own `agent_name`.** A swept conversation row carries a
 * name, but on the web build that name is stamped by the engine adapter, which
 * reads its own localStorage registry while the ACTIVITIES come from the host
 * (`engine-adapter/client/activities-mixin.ts`). Those two disagree the moment
 * an agent exists on the host and not in that registry — which is every real
 * agent — and the adapter's fallback was the literal string "Houston", so every
 * card on the board wore the product's name instead of the agent's.
 *
 * The roster is the source of truth for who an agent IS, and the card already
 * took its COLOUR from there. Taking the name from the same place is what makes
 * the two halves of one identity incapable of disagreeing.
 *
 * The row's own name survives as the fallback for a path the roster does not
 * hold — an agent moved out of reach mid-sweep, or a row from a workspace the
 * store has not loaded. Better a stale true name than a blank chip.
 *
 * Pure, and unit-tested in `app/tests/mission-card-agent.test.ts`.
 */

/** Roster name for this path, else the row's own, else nothing to show. */
export function missionCardAgentName(
  agentsByPath: Map<string, Agent>,
  agentPath: string,
  rowAgentName: string | undefined,
): string | undefined {
  return agentsByPath.get(agentPath)?.name ?? rowAgentName;
}

/** The roster keyed by folder path — a card's only handle on its agent. */
export function agentsByPath(agents: Agent[]): Map<string, Agent> {
  return new Map(agents.map((a) => [a.folderPath, a]));
}
