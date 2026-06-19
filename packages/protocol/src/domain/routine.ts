// Routines + routine runs. snake_case mirrors the on-disk .houston schemas.

/** Whether a routine's runs share one chat ("shared", default) or each run gets its own ("per_run"). */
export type RoutineChatMode = "shared" | "per_run";

export interface Routine {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  suppress_when_silent: boolean;
  chat_mode: RoutineChatMode;
  /** Integration slugs this routine uses (data carried for store agents). */
  integrations: string[];
  created_at: string;
  updated_at: string;
}

export interface NewRoutine {
  name: string;
  description?: string;
  prompt: string;
  schedule: string;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  chat_mode?: RoutineChatMode;
  integrations?: string[];
}

export interface RoutineUpdate {
  name?: string;
  description?: string;
  prompt?: string;
  schedule?: string;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  chat_mode?: RoutineChatMode;
  integrations?: string[];
}

export type RoutineRunStatus = "running" | "silent" | "surfaced" | "error" | "cancelled";

export interface RoutineRun {
  id: string;
  routine_id: string;
  status: RoutineRunStatus;
  session_key: string;
  activity_id?: string;
  summary?: string;
  started_at: string;
  completed_at?: string;
  /** Human-readable reset hint while a run sleeps on a usage-limit window. */
  paused_until?: string;
}

export interface RoutineRunUpdate {
  status?: RoutineRunStatus;
  activity_id?: string;
  summary?: string;
  completed_at?: string;
  paused_until?: string | null;
}
