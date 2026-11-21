import type {
  Routine,
  RoutineRun,
  RoutineRunFailure,
  RoutineSnooze,
} from "@houston/protocol";
import { canonicalModelId, canonicalProviderId } from "./provider-model";
import { isProviderId } from "./provider-model-catalog";
import { routinePin } from "./routine-pin";

export const USAGE_LIMIT_UNKNOWN_RESET_MS = 60 * 60 * 1000;

export const USAGE_LIMIT_MAX_SNOOZE_MS = 8 * 24 * 60 * 60 * 1000;

export function routineSnooze(
  failure: RoutineRunFailure,
  nowIso: string,
): RoutineSnooze | null {
  if (failure.code !== "usage_limit") return null;
  const nowMs = Date.parse(nowIso);
  const resetMs = failure.resets_at ? Date.parse(failure.resets_at) : NaN;
  const until =
    Number.isFinite(resetMs) && resetMs > nowMs
      ? new Date(Math.min(resetMs, nowMs + USAGE_LIMIT_MAX_SNOOZE_MS))
      : new Date(nowMs + USAGE_LIMIT_UNKNOWN_RESET_MS);
  return {
    reason: "usage_limit",
    provider: failure.provider,
    model: failure.model,
    until: until.toISOString(),
    at: nowIso,
  };
}

export function snoozeRoutine(
  routine: Routine,
  snooze: RoutineSnooze,
): Routine {
  return { ...routine, snoozed: snooze };
}

export function snoozeAfterRun(
  routine: Routine,
  run: RoutineRun,
  nowIso: string,
  actingSub?: string | null,
): RoutineSnooze | null {
  const failure = run.failure;
  if (failure?.code !== "usage_limit") return null;
  if (!routine.schedule || !routine.enabled) return null;
  if (!ranAsCreator(routine, run, actingSub)) return null;
  if (Date.parse(routine.updated_at) > Date.parse(run.started_at)) return null;
  if (!pinStillLimited(routine, failure)) return null;
  const snooze = routineSnooze(failure, nowIso);
  if (!snooze || (routine.snoozed && routine.snoozed.until >= snooze.until))
    return null;
  return snooze;
}

export function unsnoozeAfterRun(
  routine: Routine,
  run: RoutineRun,
  actingSub?: string | null,
): Routine | null {
  if (!routine.snoozed) return null;
  if (run.status !== "silent" && run.status !== "surfaced") return null;
  if (!ranAsCreator(routine, run, actingSub)) return null;
  const { snoozed: _lifted, ...rest } = routine;
  return rest;
}

function ranAsCreator(
  routine: Routine,
  run: RoutineRun,
  actingSub: string | null | undefined,
): boolean {
  if (actingSub === undefined) return run.manual !== true;
  return (routine.created_by ?? null) === actingSub;
}

function pinStillLimited(
  routine: Routine,
  failure: Extract<RoutineRunFailure, { code: "usage_limit" }>,
): boolean {
  const pin = routinePin(routine);
  const provider = canonicalProviderId(failure.provider) ?? failure.provider;
  if (pin.provider && pin.provider !== provider) return false;
  if (!pin.model || !failure.model) return true;
  const model = isProviderId(provider)
    ? (canonicalModelId(provider, failure.model) ?? failure.model)
    : failure.model;
  return pin.model === model;
}

export function routineSnoozeLogTail(snooze: RoutineSnooze): string {
  const model = snooze.model ? ` ${snooze.model}` : "";
  return `${snooze.reason} (${snooze.provider}${model}) until ${snooze.until}`;
}
