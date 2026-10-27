import type { Activity, Routine, RoutineRun } from "@houston/protocol";
import { Cron } from "croner";
import { routineConversationId } from "./conversation-keys";
import { ROUTINE_OK_TOKEN } from "./routine-prompt";
import {
  intervalScheduleError,
  isIntervalForm,
  nextIntervalRun,
  parseIntervalSchedule,
} from "./schedule-interval";

/**
 * Cron evaluation for routines — pure, timezone-aware, no I/O. The Scheduler
 * driver (host) calls these; the math lives here so it is tested in isolation
 * and shared identically by every deployment.
 */

/**
 * Validate a schedule: a cron expression (+ optional IANA tz) or an `@every`
 * interval, which ignores the zone. Returns null when valid, else the reason.
 */
export function validateSchedule(
  schedule: string,
  timezone?: string | null,
): string | null {
  if (isIntervalForm(schedule)) return intervalScheduleError(schedule);
  try {
    // Construction throws on a bad pattern; the timezone is only resolved when a
    // date is computed, so force a nextRun() to surface an invalid tz too.
    new Cron(schedule, timezone ? { timezone } : {}).nextRun();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * The next time `schedule` fires strictly after `after`, evaluated in the given
 * IANA `timezone` (the account-wide zone; or the host's local tz when absent).
 * An `@every` interval sits on its epoch grid and ignores the zone. Null when
 * the pattern never fires again or is invalid.
 */
export function nextRun(
  schedule: string,
  timezone: string | null | undefined,
  after: Date,
): Date | null {
  if (isIntervalForm(schedule)) {
    const interval = parseIntervalSchedule(schedule);
    return interval ? nextIntervalRun(interval, after) : null;
  }
  try {
    const cron = new Cron(schedule, timezone ? { timezone } : {});
    return cron.nextRun(after);
  } catch {
    return null;
  }
}

/**
 * The scheduled instant at which `routine` becomes due within the window
 * `(since, now]`, or null when it is not due. Enabled routines only. Every
 * routine fires in the single account-wide `timezone` (the workspace
 * preference); there is no per-routine override, so the driver passes the same
 * zone for every routine in a workspace. We return the FIRST fire-time after
 * `since`; the driver fires at most once per window, so a scheduler that was
 * down through several fire-times does ONE catch-up run, never a burst. The
 * returned instant is deterministic across replicas (same schedule + same
 * `since` + same zone) — the driver keys its dedup lock on it.
 */
export function dueAt(
  routine: Routine,
  since: Date,
  now: Date,
  timezone: string | null | undefined,
): Date | null {
  if (!routine.enabled) return null;
  // Trigger routines have no schedule — their wake is an external event, not the
  // cron scanner. Guard (don't throw) so the scanner skips them by construction.
  if (!routine.schedule) return null;
  // A snoozed routine (its account's plan limit, routine-snooze.ts) skips every
  // instant before the snooze end: the window's left edge moves up to 1 ms
  // before it, so a fire exactly at the reset runs and the skipped ones never
  // catch up. The cloud planner applies the same rule to its own fire rows
  // (`snoozed_until` in the schedule snapshot, contract C19).
  const snoozedUntil = routine.snoozed
    ? Date.parse(routine.snoozed.until)
    : NaN;
  const from =
    Number.isFinite(snoozedUntil) && snoozedUntil > since.getTime()
      ? new Date(snoozedUntil - 1)
      : since;
  const next = nextRun(routine.schedule, timezone, from);
  if (next && next.getTime() <= now.getTime()) return next;
  return null;
}

/** A fresh "running" run record. Caller supplies id + clock (domain stays pure). */
export function createRoutineRun(
  routine: Routine,
  runId: string,
  nowIso: string,
): RoutineRun {
  return {
    id: runId,
    routine_id: routine.id,
    status: "running",
    session_key: routineConversationId(routine, runId),
    started_at: nowIso,
  };
}

// The cap lives in protocol so the object sync's run-history merge applies
// the same rule without depending on domain.
export { MAX_RUNS_PER_ROUTINE, pruneRoutineRuns } from "@houston/protocol";

// --- Run completion (matches engine/houston-engine-core/src/routines/runner.rs) ---

/** Silent iff the trimmed response starts or ends with the token (case-sensitive). */
export function responseIsSilent(response: string): boolean {
  const trimmed = response.trim();
  return (
    trimmed.startsWith(ROUTINE_OK_TOKEN) || trimmed.endsWith(ROUTINE_OK_TOKEN)
  );
}

/** Run summary: response with the token stripped, trimmed, capped at 200 chars (…), or "Nothing to report". */
export function extractRunSummary(response: string): string {
  const without = response.trim().split(ROUTINE_OK_TOKEN).join("").trim();
  if (without === "") return "Nothing to report";
  return [...without].length <= 200
    ? without
    : `${[...without].slice(0, 199).join("")}…`;
}

/**
 * Classify a completed turn into the run's terminal state. silent (suppressed +
 * token) or surfaced; both carry the summary + completed_at. The caller creates
 * the Activity for a surfaced run (it needs id/store access).
 */
export function completeRoutineRun(
  run: RoutineRun,
  routine: Routine,
  responseText: string,
  nowIso: string,
): RoutineRun {
  const silent = routine.suppress_when_silent && responseIsSilent(responseText);
  return {
    ...run,
    status: silent ? "silent" : "surfaced",
    summary: extractRunSummary(responseText),
    completed_at: nowIso,
  };
}

/**
 * The board item a surfaced run shows the user. Reuses an existing activity for
 * the routine's conversation (keyed by session_key, like the Rust engine), else
 * builds a fresh one. Always points at the latest run + flags `needs_you`.
 */
export function routineActivity(
  routine: Routine,
  run: RoutineRun,
  existing: Activity | undefined,
  newId: string,
  nowIso: string,
): Activity {
  const base = existing ?? {
    id: newId,
    title: routine.name,
    description: "",
    status: "needs_you",
    session_key: run.session_key,
  };
  return {
    ...base,
    status: "needs_you",
    session_key: run.session_key,
    routine_id: routine.id,
    routine_run_id: run.id,
    updated_at: nowIso,
    last_message_at: nowIso,
  };
}
