import type {
  RoutineDeliveryFailure,
  RoutineRunFailure,
} from "./routine-failure";

export const MAX_RUNS_PER_ROUTINE = 50;

export function pruneRoutineRuns<T extends { routine_id: string }>(
  items: T[],
): T[] {
  const kept = new Map<string, number>();
  return items.filter((run) => {
    const n = (kept.get(run.routine_id) ?? 0) + 1;
    kept.set(run.routine_id, n);
    return n <= MAX_RUNS_PER_ROUTINE;
  });
}

export type RoutineRunStatus =
  | "running"
  | "silent"
  | "surfaced"
  | "error"
  | "cancelled";

export interface RoutineRun {
  id: string;
  routine_id: string;
  status: RoutineRunStatus;
  session_key: string;
  activity_id?: string;
  summary?: string;
  started_at: string;
  completed_at?: string;
  paused_until?: string;
  failure?: RoutineRunFailure;
  delivery_failure?: RoutineDeliveryFailure;
  resumed?: true;
  manual?: true;
}

export interface RoutineRunUpdate {
  status?: RoutineRunStatus;
  activity_id?: string;
  summary?: string;
  completed_at?: string;
  paused_until?: string | null;
  resumed?: true;
}
