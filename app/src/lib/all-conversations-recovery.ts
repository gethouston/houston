/**
 * Recovery policy for a PARTIAL cross-agent conversation sweep (HOU-981).
 *
 * The hosted sweep fans out one read per agent. Any single agent can fail on
 * its own — a pod that never woke, a gateway blip — while the rest answer. The
 * adapter now keeps the agents that answered and reports the ones that didn't
 * (`AllConversationsResult.failedAgentPaths`) instead of rejecting the whole
 * board. That leaves the query layer two obligations, both handled here:
 *
 *  1. **Don't lose the failed agents' missions.** A partial sweep must not
 *     overwrite the cache with a hole: the last-known rows for an agent that
 *     did not answer are still the best truth we have, so they are carried
 *     forward ({@link mergePartialSweep}).
 *  2. **Don't freeze the gap.** The aggregate is `staleTime: Infinity` (a
 *     background sweep would keep every pod awake), so nothing would ever
 *     revisit a partial answer. A partial sweep therefore schedules its own
 *     bounded re-sweep ({@link planPartialSweep}).
 *
 * Pure and dependency-free so it unit-tests under node:test; the wiring lives
 * in hooks/queries/use-conversations.ts.
 */

/** The minimum a merged/failed row needs: which agent it belongs to. */
export interface AgentScopedRow {
  agent_path: string;
}

/**
 * Fold a partial sweep into the previous answer: fresh rows win for every agent
 * that ANSWERED, and the previous rows are kept for the agents that failed.
 *
 * Order is deliberate — fresh first, carried-forward after — so the result is
 * stable across sweeps and the consumer's own sorting is unaffected. With no
 * previous data, or with nothing failed, this is the fresh rows unchanged (same
 * array reference when there is nothing to carry, so React memos hold).
 */
export function mergePartialSweep<T extends AgentScopedRow>(
  fresh: T[],
  previous: T[] | undefined,
  failedAgentPaths: readonly string[],
): T[] {
  if (failedAgentPaths.length === 0 || !previous?.length) return fresh;
  const failed = new Set(failedAgentPaths);
  const carried = previous.filter((row) => failed.has(row.agent_path));
  return carried.length === 0 ? fresh : [...fresh, ...carried];
}

/**
 * Backoff for re-sweeping after a partial answer. Bounded on purpose: each
 * re-sweep touches EVERY agent's pod (it resets their idle-sleep clocks), so
 * an agent that stays broken must not keep the fleet awake all session. After
 * the last delay the aggregate waits for a real signal instead — a remount, an
 * event-stream reconnect, or an event naming that agent.
 */
export const PARTIAL_SWEEP_RETRY_DELAYS_MS = [5_000, 20_000, 60_000];

export interface PartialSweepDecision {
  /** Tell the user this sweep was incomplete. */
  toast: boolean;
  /** Re-sweep after this many ms; `undefined` = stop retrying. */
  retryInMs?: number;
}

/**
 * What to do after a sweep, given how many agents it could not read and how
 * many consecutive partial sweeps preceded it.
 *
 * The toast fires only on the FIRST partial sweep of a run: the user needs to
 * know their board is incomplete, not a toast per retry.
 */
export function planPartialSweep(
  failedCount: number,
  consecutivePartialSweeps: number,
): PartialSweepDecision {
  if (failedCount <= 0) return { toast: false };
  return {
    toast: consecutivePartialSweeps === 0,
    retryInMs: PARTIAL_SWEEP_RETRY_DELAYS_MS[consecutivePartialSweeps],
  };
}
