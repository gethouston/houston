import type { Activity, Routine, RoutineRun } from "@houston/protocol";
import { Cron } from "croner";

/**
 * Cron evaluation for routines — pure, timezone-aware, no I/O. The Scheduler
 * driver (host) calls these; the math lives here so it is tested in isolation
 * and shared identically by every deployment.
 */

/** Validate a cron expression (+ optional IANA tz). Returns null when valid, else the reason. */
export function validateSchedule(
  schedule: string,
  timezone?: string | null,
): string | null {
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
 * Null when the pattern never fires again or is invalid.
 */
export function nextRun(
  schedule: string,
  timezone: string | null | undefined,
  after: Date,
): Date | null {
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
  const next = nextRun(routine.schedule, timezone, since);
  if (next && next.getTime() <= now.getTime()) return next;
  return null;
}

/**
 * The conversation a routine run uses. `shared` (default) → one conversation
 * per routine, so every run continues the same chat; `per_run` → a fresh
 * conversation per run. Matches the RoutineChatMode contract.
 */
export function routineConversationId(routine: Routine, runId: string): string {
  return routine.chat_mode === "per_run"
    ? `routine-${routine.id}-${runId}`
    : `routine-${routine.id}`;
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

/** Run-history cap per routine — matches the Rust engine's MAX_RUNS_PER_ROUTINE. */
export const MAX_RUNS_PER_ROUTINE = 50;

/**
 * Cap the run history at MAX_RUNS_PER_ROUTINE per routine, dropping the oldest.
 * Items are stored newest-first (the writer prepends), so "oldest" is simply
 * everything past the cap for that routine_id.
 */
export function pruneRoutineRuns(items: RoutineRun[]): RoutineRun[] {
  const kept = new Map<string, number>();
  return items.filter((run) => {
    const n = (kept.get(run.routine_id) ?? 0) + 1;
    kept.set(run.routine_id, n);
    return n <= MAX_RUNS_PER_ROUTINE;
  });
}

// --- Run completion (matches engine/houston-engine-core/src/routines/runner.rs) ---

/** The exact sentinel the agent emits to signal "nothing to surface". */
export const ROUTINE_OK_TOKEN = "ROUTINE_OK";

/**
 * Appended to a routine's prompt when suppress_when_silent — tells the agent how
 * to signal a silent run. Verbatim from runner.rs SUPPRESSION_INSTRUCTION so the
 * agent behaves identically to the Rust engine.
 */
export const SUPPRESSION_INSTRUCTION = `\n\n---\nIMPORTANT: If nothing requires the user's attention or action, end your response with exactly "ROUTINE_OK" (on its own line). If something needs the user's attention, respond with your findings — do NOT include "ROUTINE_OK".`;

/** The prompt actually sent when firing a routine (suppression instruction appended if opted in). */
export function routinePrompt(routine: Routine): string {
  return routine.suppress_when_silent
    ? `${routine.prompt}${SUPPRESSION_INSTRUCTION}`
    : routine.prompt;
}

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
    description: routine.description,
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
  };
}
