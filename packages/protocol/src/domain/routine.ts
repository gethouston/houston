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
  /** IANA timezone override; absent means the user's preference. */
  timezone?: string | null;
  /** Provider id override (e.g. "anthropic", "openai"); absent means inherit the agent's provider. */
  provider?: string | null;
  /** Model override (e.g. "claude-opus-4-8", "gpt-5.5"); absent means inherit the agent's model. */
  model?: string | null;
  /** Reasoning-effort override (e.g. "high", "max"); absent means inherit the agent's effort. */
  effort?: string | null;
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
  timezone?: string | null;
  /** Provider id to pin (e.g. "openai"); omit to inherit the agent's provider. */
  provider?: string | null;
  /** Model to pin (e.g. "gpt-5.5"); omit to inherit the agent's model. */
  model?: string | null;
  /** Reasoning effort to pin (e.g. "high"); omit to inherit the agent's effort. */
  effort?: string | null;
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
  /** Set a string to override, `null` to clear, omit to leave unchanged. */
  timezone?: string | null;
  /** Provider id to pin; `null` clears (back to inherit), omit to leave unchanged. */
  provider?: string | null;
  /** Model to pin; `null` clears (back to inherit), omit to leave unchanged. */
  model?: string | null;
  /** Reasoning effort to pin; `null` clears (back to inherit), omit to leave unchanged. */
  effort?: string | null;
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
