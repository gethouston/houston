import type { Agent } from "./types.ts";

/**
 * What a surface says when a per-agent read did not answer.
 *
 * Two surfaces need it, for the same reason. A CROSS-agent list (a team's
 * Routines) has a failure mode a per-agent one does not: a short list that
 * looks complete. Dropping the agents that failed (the `.catch(() => [])`
 * reflex) would present four agents' routines as the team's routines, and
 * nobody would know a fifth is missing. A SINGLE-agent tree (the Files section)
 * has the twin of it: an empty tree and a broken tree look identical. Both keep
 * rendering what they have AND name what they could not reach.
 *
 * Pure, so the counting and the ordering are unit tested
 * (`app/tests/agent-read-failures.test.ts`).
 */

/** One agent a read could not reach, named the way the strip names it. */
export interface FailedAgentRead {
  id: string;
  name: string;
  folderPath: string;
}

export interface AgentReadFailures {
  /** The agents that failed, in the caller's own order. */
  failed: FailedAgentRead[];
  /** How many agents the surface tried to read. */
  total: number;
}

/** One agent's read outcome, as a query (or a fan-out) reports it. */
export interface AgentReadResult {
  agent: Agent;
  /** Truthy for a read that errored. Loading is NOT a failure. */
  error: unknown;
}

/**
 * The failure model for a surface's reads. Keeps the caller's agent order (a
 * team's drag order), so the strip lists agents in the same order every other
 * team surface does. A single-agent surface passes one result.
 */
export function agentReadFailures(
  results: AgentReadResult[],
): AgentReadFailures {
  return {
    failed: results
      .filter((r) => r.error != null)
      .map(({ agent }) => ({
        id: agent.id,
        name: agent.name,
        folderPath: agent.folderPath,
      })),
    total: results.length,
  };
}

/**
 * ONE named set of failures for a surface that makes SEVERAL cross-agent reads.
 *
 * The team Routines section reads each agent's routines, its runs, its setup
 * chats and its trigger health. An agent whose routines arrived but whose
 * trigger health did not is still an agent this list cannot tell the whole
 * truth about, so it has to be named — but two strips stacked over one list is
 * noise, and an agent that failed several reads is still one missing agent,
 * named once. `total` is the larger of the two counts: every fan-out sweeps the
 * same scoped roster.
 */
export function mergeAgentReadFailures(
  a: AgentReadFailures,
  b: AgentReadFailures,
): AgentReadFailures {
  const named = new Set(a.failed.map((f) => f.id));
  return {
    failed: [...a.failed, ...b.failed.filter((f) => !named.has(f.id))],
    total: Math.max(a.total, b.total),
  };
}

/**
 * EVERY agent the surface tried to read failed — so it knows nothing at all,
 * and an empty list is not evidence of an empty team.
 *
 * This is the difference between "nothing runs on its own yet" (a fact) and
 * "Houston could not find out" (the truth when every read 500s). Rendering the
 * first under a strip that says the opposite is the exact lie the strip exists
 * to prevent, so the surface words its empty state from this.
 *
 * `total === 0` is not this state: a team with no agents in scope has nothing
 * to fail, and its own empty state is honest.
 */
export function allAgentReadsFailed(f: AgentReadFailures): boolean {
  return f.total > 0 && f.failed.length === f.total;
}
