/**
 * Recovery policy for the cross-agent conversation sweep (HOU-981).
 *
 * The hosted sweep fans out one read per agent. Any single agent can fail on
 * its own — a pod that never woke, a gateway blip — while the rest answer. The
 * adapter now keeps the agents that answered and reports the ones that didn't
 * (`AllConversationsResult.failedAgents`) instead of rejecting the whole
 * board. That leaves the query layer four obligations, all handled here:
 *
 *  1. **Don't lose the failed agents' missions.** A partial sweep must not
 *     overwrite the cache with a hole: the last-known rows for an agent that
 *     did not answer are still the best truth we have, so they are carried
 *     forward ({@link mergePartialSweep}).
 *  2. **Don't freeze the gap.** The aggregate is never refetched on focus or on
 *     a timer (a background sweep would keep every pod awake), so nothing else
 *     would revisit a partial answer inside its freshness window. A partial
 *     sweep therefore schedules its own bounded re-sweep
 *     ({@link planPartialSweep}), counted per roster
 *     ({@link stepSweepRecovery}) so a space switch starts clean.
 *  3. **Don't multiply the surface.** A whole-fleet failure is retried inside
 *     the queryFn, and every attempt but the last runs silent
 *     ({@link planSweepAttempt}) — the engine wrapper toasts and captures on
 *     each rejection, so retrying at the query layer reported one outage four
 *     times.
 *  4. **Don't call a non-answer an answer.** The board's "you have no missions"
 *     verdict waits for a settled, non-placeholder success
 *     (`sweepIsAuthoritative`, lib/sweep-authoritative.ts).
 *
 * Pure and dependency-free so it unit-tests under node:test; the wiring lives
 * in hooks/queries/use-conversations.ts, and HOW an incomplete sweep is told
 * to the user (waking pod vs offline vs real failure) is the sibling policy in
 * lib/partial-sweep-surface.ts.
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

export type PartialSweepSurface =
  /** First partial sweep of a run: tell the user once, CLASSIFIED — a waking
   *  pod or an offline drop gets its quiet informational surface, anything
   *  else the real error report. */
  | "notice"
  /** The bounded re-sweeps are exhausted and the hole is still open. Whatever
   *  the reason looked like, a pod that never came up through the whole run is
   *  the bug report we want — always the error surface. */
  | "escalate";

export interface PartialSweepDecision {
  /** How (and whether) to tell anyone this sweep was incomplete. */
  surface?: PartialSweepSurface;
  /** Re-sweep after this many ms; `undefined` = stop retrying. */
  retryInMs?: number;
}

/**
 * What to do after a sweep, given how many agents it could not read and how
 * many consecutive partial sweeps preceded it.
 *
 * The notice fires only on the FIRST partial sweep of a run (the user needs to
 * know their board is incomplete, not a surface per retry); the escalation
 * fires exactly once, when the retry schedule runs out with the hole still
 * open. Runs past that stay quiet: the failure was reported, the carried
 * forward rows keep painting, and the next complete sweep resets the run.
 */
export function planPartialSweep(
  failedCount: number,
  consecutivePartialSweeps: number,
): PartialSweepDecision {
  if (failedCount <= 0) return {};
  if (consecutivePartialSweeps === 0)
    return { surface: "notice", retryInMs: PARTIAL_SWEEP_RETRY_DELAYS_MS[0] };
  if (consecutivePartialSweeps === PARTIAL_SWEEP_RETRY_DELAYS_MS.length)
    return { surface: "escalate" };
  const retryInMs = PARTIAL_SWEEP_RETRY_DELAYS_MS[consecutivePartialSweeps];
  return retryInMs === undefined ? {} : { retryInMs };
}

/**
 * The run counter above, tied to the roster it was counted on.
 *
 * `roster` is the aggregate's query-key signature: the exact set of agent paths
 * being swept. It changes when the user switches space, or when an agent is
 * added or removed — and at that moment the previous run stops meaning
 * anything, because the failures it counted belonged to another fleet.
 */
export interface SweepRecoveryState {
  /** Query-key signature of the roster this run was counted on. */
  roster: string;
  /** Consecutive partial sweeps observed for that roster. */
  run: number;
}

/** No roster swept yet — the state a fresh page starts from. */
export const NO_SWEEP_RECOVERY: SweepRecoveryState = { roster: "", run: 0 };

export interface SweepRecoveryStep {
  /** Carry this into the next settled sweep. */
  state: SweepRecoveryState;
  decision: PartialSweepDecision;
}

/**
 * Fold one settled sweep into the recovery state.
 *
 * The roster keying is the whole point: an unkeyed counter saturated for the
 * session, so after three partial sweeps a user who switched space got a board
 * that would never again tell them it was incomplete and never again re-sweep.
 * A complete sweep clears the run (the hole is filled) and still re-keys, so
 * the state always names the roster it describes.
 */
export function stepSweepRecovery(
  previous: SweepRecoveryState,
  roster: string,
  failedCount: number,
): SweepRecoveryStep {
  const run = previous.roster === roster ? previous.run : 0;
  if (failedCount <= 0) {
    return { state: { roster, run: 0 }, decision: {} };
  }
  return {
    state: { roster, run: run + 1 },
    decision: planPartialSweep(failedCount, run),
  };
}

/**
 * Backoff between attempts at a sweep that failed OUTRIGHT (every agent, or the
 * gateway itself). A cold pod outlives the transport's own blind retries, and
 * giving up there is what renders the empty board.
 *
 * Short and few on purpose: this delays the toast that tells the user their
 * board is not loading, and the user is watching an empty screen while it runs.
 */
export const SWEEP_ATTEMPT_DELAYS_MS = [1_000, 2_000, 4_000];

export type SweepAttemptDecision =
  /** Wait, then try the sweep again. The attempt stays silent. */
  | { retryInMs: number; surface: false }
  /** Out of attempts, or a failure that will never heal: tell the user. */
  | { surface: true };

/**
 * What to do after attempt `attempt` (0-based) of a sweep failed.
 *
 * The retry has to live inside the queryFn rather than at the useQuery layer,
 * and this is why: the engine wrapper (`call()` in lib/tauri.ts) toasts AND
 * Sentry-captures on every rejection, so a query-level `retry: 3` turned one
 * dead fleet into four captures and a stack of toasts. Here the retried
 * attempts run silent and EXACTLY ONE decision in a run says `surface` — the
 * no-silent-failures invariant, without the noise.
 */
export function planSweepAttempt(
  attempt: number,
  transient: boolean,
): SweepAttemptDecision {
  const retryInMs = transient ? SWEEP_ATTEMPT_DELAYS_MS[attempt] : undefined;
  return retryInMs === undefined
    ? { surface: true }
    : { retryInMs, surface: false };
}
