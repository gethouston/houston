import type {
  ProviderError,
  Routine,
  RoutineAutoPause,
  RoutineRun,
  RoutineRunFailure,
  RoutineRunFailureCode,
} from "@houston/protocol";

export const ROUTINE_AUTO_PAUSE_AFTER = 10;

function isTeamCredential(err: ProviderError): boolean {
  return err.credential?.scope === "team";
}

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

export function unconnectedRoutineFailure(
  provider: string | null | undefined,
): RoutineRunFailure {
  return provider
    ? { code: "creator_not_connected", provider }
    : { code: "no_model" };
}

export function routineFailureProvider(
  failure: RoutineRunFailure | RoutineAutoPause,
): string | undefined {
  if ("cause" in failure && failure.cause) return undefined;
  return "provider" in failure ? failure.provider || undefined : undefined;
}

function sameWall(a: RoutineRunFailure, b: RoutineRunFailure): boolean {
  return (
    a.code === b.code && routineFailureProvider(a) === routineFailureProvider(b)
  );
}

const startedMs = (run: RoutineRun): number => {
  const ms = Date.parse(run.started_at);
  return Number.isFinite(ms) ? ms : 0;
};

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
  if (!wall || failures < ROUTINE_AUTO_PAUSE_AFTER) return null;
  return wall.code === "no_model"
    ? {
        reason: "model_unavailable",
        provider: "",
        cause: "no_model",
        failures,
        at: nowIso,
      }
    : { reason: wall.code, provider: wall.provider, failures, at: nowIso };
}

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

export function routineAutoPauseLogTail(
  pause: RoutineAutoPause | undefined,
): string {
  if (!pause) return "no pause recorded";
  const provider = routineFailureProvider(pause);
  const reason = pause.cause ?? pause.reason;
  return `${pause.failures} runs: ${reason}${provider ? ` (${provider})` : ""}`;
}
