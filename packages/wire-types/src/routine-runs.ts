import type {
  RoutineDeliveryFailure,
  RoutineRunFailure,
} from "@houston/protocol";

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
