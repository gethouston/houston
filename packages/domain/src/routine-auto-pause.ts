import type {
  ProviderError,
  Routine,
  RoutineAutoPause,
  RoutineRun,
  RoutineRunFailure,
  RoutineRunFailureCode,
} from "@houston/protocol";

/**
 * Auto-pause: a routine whose latest runs all failed on the same wall a person
 * has to clear (no account connected, an expired login, no credits left, a
 * model the account cannot run) stops firing until someone resumes it. Every
 * fire is a paid sandbox turn, and a routine firing every minute into a dead
 * credential burns one per minute for nothing.
 *
 * The streak is read off the routine's own run history (routine_runs.json),
 * which both execution paths already write — the standing pod's reconcile and
 * the pooled worker's settle — so no counter lives anywhere else. Pure: the
 * callers own the reads, the write and the clock.
 */

/**
 * Consecutive same-kind user-fixable failures that pause a routine. Picked on
 * 30 days of fleet routine turns (to 2026-09-24): 10 pauses 444 routines and
 * drops 84% of the spend on failed routine turns, 5 would save only 2% more
 * while pausing twice as many routines that later recovered alone (89 vs 45),
 * and 20 lets a daily routine fail for three weeks. It is a count, not a
 * time: a routine firing every minute stops within ten minutes, a daily one
 * after ten days.
 */
export const ROUTINE_AUTO_PAUSE_AFTER = 10;

export const ROUTINE_PROVIDER_ERROR_PAUSE_AFTER = 5;

/** Whose credential ran a failed turn. No acting identity = the creator's own. */
function isTeamCredential(err: ProviderError): boolean {
  return err.credential?.scope === "team";
}

/**
 * The typed failure for a turn's provider error, or undefined when the error
 * is not a wall a person has to clear: a rate limit, an outage, a network
 * blip, an overflowing conversation. Those leave the run's story in its
 * summary and never count toward a pause. A plan usage window that resets by
 * itself is typed too (`usage_limit`), not for the pause streak (it skips it)
 * but for the snooze that stops firing until the reset (routine-snooze.ts).
 */
export function routineRunFailure(
  err: ProviderError,
): RoutineRunFailure | undefined {
  if (err.kind === "usage_limit_paused")
    return {
      code: "usage_limit",
      provider: err.provider,
      model: err.model,
      resets_at: err.resets_at,
    };
  if (err.kind === "quota_exhausted")
    return { code: "out_of_credits", provider: err.provider };
  if (err.kind === "model_unavailable")
    return { code: "model_unavailable", provider: err.provider };
  if (err.kind === "unknown")
    return { code: "provider_error", provider: err.provider };
  if (err.kind !== "unauthenticated") return undefined;
  const team = isTeamCredential(err);
  const code: RoutineRunFailureCode =
    err.cause === "no_credentials"
      ? team
        ? "team_not_connected"
        : "creator_not_connected"
      : team
        ? "team_needs_reconnect"
        : "creator_needs_reconnect";
  return { code, provider: err.provider };
}

/**
 * The typed failure for a routine fire that never reached a provider because
 * nothing usable was connected for the identity it runs as. It blames the
 * provider the turn would have run on: the routine's pin, else the agent's
 * saved provider (logged out, or its login expired). Only a routine that names
 * no model on an agent with nothing saved has no provider to name, and
 * choosing a model is the fix (PRODUCT-1982). All count toward the same
 * auto-pause streak, so the routine stops firing into nothing.
 */
export function unconnectedRoutineFailure(
  provider: string | null | undefined,
): Exclude<RoutineRunFailure, { code: "provider_error" | "usage_limit" }> {
  return provider
    ? { code: "creator_not_connected", provider }
    : { code: "no_model" };
}

/** The provider a run failure or a pause names; absent for `no_model`. */
export function routineFailureProvider(
  failure: RoutineRunFailure | RoutineAutoPause,
): string | undefined {
  if ("cause" in failure && failure.cause === "no_model") return undefined;
  return "provider" in failure ? failure.provider || undefined : undefined;
}

/** Whether two typed failures are the same wall (code and provider). */
function sameWall(a: RoutineRunFailure, b: RoutineRunFailure): boolean {
  return (
    a.code === b.code && routineFailureProvider(a) === routineFailureProvider(b)
  );
}

const startedMs = (run: RoutineRun): number => {
  const ms = Date.parse(run.started_at);
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * The pause `routine` has earned, or null. Walks the routine's finished runs
 * newest first and counts the streak of errors that share one typed failure:
 * - a run that answered (silent or surfaced) ends the streak — it recovered;
 * - a typed failure of another kind or provider ends it too (a new wall);
 * - an error with no typed failure (a timeout, an outage, a rate limit), a
 *   usage limit that resets by itself (`usage_limit`, which snoozes instead),
 *   a fire cloud never started (`delivery_failure`: no worker in time, or a
 *   creator who lost access to the agent, never an account the run used)
 *   and a run someone stopped neither count nor end it;
 * - runs that started before the routine's last edit are not counted, so
 *   resuming (or fixing the routine's model) starts the count from zero.
 */
export function routineAutoPause(
  routine: Routine,
  runs: RoutineRun[],
  nowIso: string,
): RoutineAutoPause | null {
  if (!routine.enabled || routine.auto_paused) return null;
  const editedMs = Date.parse(routine.updated_at);
  const since = Number.isFinite(editedMs) ? editedMs : 0;
  const finished = runs
    .filter((r) => r.routine_id === routine.id && r.status !== "running")
    .filter((r) => startedMs(r) >= since)
    .sort((a, b) => startedMs(b) - startedMs(a));
  // Only walls a person clears can start a streak; a usage limit snoozes.
  let wall: Exclude<RoutineRunFailure, { code: "usage_limit" }> | undefined;
  let failures = 0;
  for (const run of finished) {
    if (run.status === "cancelled") continue;
    if (run.status !== "error") break;
    if (!run.failure || run.failure.code === "usage_limit") continue;
    wall ??= run.failure;
    if (!sameWall(run.failure, wall)) break;
    failures++;
  }
  if (!wall || failures < pauseAfter(wall)) return null;
  // A no-model pause keeps an account reason old clients can render
  // (`RoutineAutoPause.cause`).
  if (wall.code === "no_model")
    return {
      reason: "model_unavailable",
      provider: "",
      cause: "no_model",
      failures,
      at: nowIso,
    };
  if (wall.code === "provider_error")
    return {
      reason: "model_unavailable",
      provider: wall.provider,
      cause: "provider_error",
      failures,
      at: nowIso,
    };
  return { reason: wall.code, provider: wall.provider, failures, at: nowIso };
}

const pauseAfter = (wall: RoutineRunFailure): number =>
  wall.code === "provider_error"
    ? ROUTINE_PROVIDER_ERROR_PAUSE_AFTER
    : ROUTINE_AUTO_PAUSE_AFTER;

/** The routine, paused by the engine for `pause`. */
export function autoPauseRoutine(
  routine: Routine,
  pause: RoutineAutoPause,
): Routine {
  return {
    ...routine,
    enabled: false,
    auto_paused: pause,
    updated_at: pause.at,
  };
}

/** The log line's tail for a pause: "<failures> runs: <reason> (<provider>)". */
export function routineAutoPauseLogTail(
  pause: RoutineAutoPause | undefined,
): string {
  if (!pause) return "no pause recorded";
  const provider = routineFailureProvider(pause);
  const reason = pause.cause ?? pause.reason;
  return `${pause.failures} runs: ${reason}${provider ? ` (${provider})` : ""}`;
}
