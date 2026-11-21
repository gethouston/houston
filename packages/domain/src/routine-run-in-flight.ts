import type { RoutineRun } from "@houston/protocol";
import { RESUME_MAX_AGE_MS } from "./turn-resume-age";

export const ROUTINE_RUN_TIMEOUT_MS = 15 * 60 * 1000;

export function holdsRoutineBusy(run: RoutineRun, nowMs: number): boolean {
  if (run.status !== "running") return false;
  const startedMs = Date.parse(run.started_at);
  if (!Number.isFinite(startedMs)) return false;
  const window = run.resumed
    ? RESUME_MAX_AGE_MS + ROUTINE_RUN_TIMEOUT_MS
    : ROUTINE_RUN_TIMEOUT_MS;
  return nowMs - startedMs < window;
}
