import { Cron } from "croner";
import type { Routine, RoutineRun } from "@houston/protocol";

/**
 * Cron evaluation for routines — pure, timezone-aware, no I/O. The Scheduler
 * driver (host) calls these; the math lives here so it is tested in isolation
 * and shared identically by every deployment.
 */

/** Validate a cron expression (+ optional IANA tz). Returns null when valid, else the reason. */
export function validateSchedule(schedule: string, timezone?: string | null): string | null {
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
 * The next time `schedule` fires strictly after `after`, evaluated in the
 * routine's timezone (or the host's local tz when absent). Null when the
 * pattern never fires again or is invalid.
 */
export function nextRun(schedule: string, timezone: string | null | undefined, after: Date): Date | null {
  try {
    const cron = new Cron(schedule, timezone ? { timezone } : {});
    return cron.nextRun(after);
  } catch {
    return null;
  }
}

/**
 * The scheduled instant at which `routine` becomes due within the window
 * `(since, now]`, or null when it is not due. Enabled routines only. We return
 * the FIRST fire-time after `since`; the driver fires at most once per window,
 * so a scheduler that was down through several fire-times does ONE catch-up
 * run, never a burst. The returned instant is deterministic across replicas
 * (same schedule + same `since`) — the driver keys its dedup lock on it.
 */
export function dueAt(routine: Routine, since: Date, now: Date): Date | null {
  if (!routine.enabled) return null;
  const next = nextRun(routine.schedule, routine.timezone, since);
  if (next && next.getTime() <= now.getTime()) return next;
  return null;
}

/**
 * The conversation a routine run uses. `shared` (default) → one conversation
 * per routine, so every run continues the same chat; `per_run` → a fresh
 * conversation per run. Matches the RoutineChatMode contract.
 */
export function routineConversationId(routine: Routine, runId: string): string {
  return routine.chat_mode === "per_run" ? `routine-${routine.id}-${runId}` : `routine-${routine.id}`;
}

/** A fresh "running" run record. Caller supplies id + clock (domain stays pure). */
export function createRoutineRun(routine: Routine, runId: string, nowIso: string): RoutineRun {
  return {
    id: runId,
    routine_id: routine.id,
    status: "running",
    session_key: routineConversationId(routine, runId),
    started_at: nowIso,
  };
}
