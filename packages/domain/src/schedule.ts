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

export function validateSchedule(
  schedule: string,
  timezone?: string | null,
): string | null {
  if (/^(?:CRON_TZ|TZ)=/.test(schedule.trimStart())) {
    return `Leave the time zone out of the schedule: routines run in ${timezone || "the deployment's local time zone"}. Write the cron in that local time.`;
  }
  if (isIntervalForm(schedule)) return intervalScheduleError(schedule);
  try {
    new Cron(schedule, timezone ? { timezone } : {}).nextRun();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

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

export function dueAt(
  routine: Routine,
  since: Date,
  now: Date,
  timezone: string | null | undefined,
): Date | null {
  if (!routine.enabled) return null;
  if (!routine.schedule) return null;
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

export { MAX_RUNS_PER_ROUTINE, pruneRoutineRuns } from "@houston/protocol";

export function responseIsSilent(response: string): boolean {
  const trimmed = response.trim();
  return (
    trimmed.startsWith(ROUTINE_OK_TOKEN) || trimmed.endsWith(ROUTINE_OK_TOKEN)
  );
}

export function extractRunSummary(response: string): string {
  const without = response.trim().split(ROUTINE_OK_TOKEN).join("").trim();
  if (without === "") return "Nothing to report";
  return [...without].length <= 200
    ? without
    : `${[...without].slice(0, 199).join("")}…`;
}

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
