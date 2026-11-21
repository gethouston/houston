export interface AgentScopedRow {
  agent_path: string;
}

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

export const PARTIAL_SWEEP_RETRY_DELAYS_MS = [
  5_000, 20_000, 60_000, 120_000, 180_000,
];

export type PartialSweepSurface = "notice" | "escalate";

export interface PartialSweepDecision {
  surface?: PartialSweepSurface;
  retryInMs?: number;
}

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

export interface SweepRecoveryState {
  roster: string;
  run: number;
}

export const NO_SWEEP_RECOVERY: SweepRecoveryState = { roster: "", run: 0 };

export interface SweepRecoveryStep {
  state: SweepRecoveryState;
  decision: PartialSweepDecision;
}

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

export const SWEEP_ATTEMPT_DELAYS_MS = [1_000, 2_000, 4_000];

export type SweepAttemptDecision =
  | { retryInMs: number; surface: false }
  | { surface: true };

export function planSweepAttempt(
  attempt: number,
  transient: boolean,
): SweepAttemptDecision {
  const retryInMs = transient ? SWEEP_ATTEMPT_DELAYS_MS[attempt] : undefined;
  return retryInMs === undefined
    ? { surface: true }
    : { retryInMs, surface: false };
}
