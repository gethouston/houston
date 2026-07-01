// Routine types — mirrors Houston's new file-backed Routine model.

/**
 * Whether a routine's runs share one chat or each start a fresh one.
 * `"shared"` (the default) keeps one chat per routine; `"per_run"` surfaces
 * each run in its own chat.
 */
export type RoutineChatMode = "shared" | "per_run";

export interface Routine {
  id: string;
  name: string;
  description: string;
  /** The prompt sent to Claude when this routine fires. */
  prompt: string;
  /** Cron expression (e.g. "0 9 * * 1-5"). */
  schedule: string;
  enabled: boolean;
  /** When true, runs where Claude responds with ROUTINE_OK are auto-completed silently. */
  suppress_when_silent: boolean;
  /** Whether each run reuses one chat or starts a fresh one. */
  chat_mode: RoutineChatMode;
  /** Composio toolkit slugs this routine uses (e.g. ["gmail", "slack"]). */
  integrations: string[];
  /** Provider id override; absent means inherit the agent's provider. */
  provider?: string | null;
  /** Model override; absent means inherit the agent's model. */
  model?: string | null;
  /** Reasoning-effort override; absent means inherit the agent's effort. */
  effort?: string | null;
  created_at: string;
  updated_at: string;
}

export type RunStatus =
  | "running"
  | "silent"
  | "surfaced"
  | "error"
  | "cancelled";

export interface RoutineRun {
  id: string;
  routine_id: string;
  status: RunStatus;
  /** Session key for chat history lookup. */
  session_key: string;
  /** If surfaced, the activity ID created on the board. */
  activity_id?: string;
  /** Brief summary of the run output. */
  summary?: string;
  started_at: string;
  completed_at?: string;
  /** Human-readable reset hint (e.g. `"5pm (America/Los_Angeles)"`) when the
   *  provider CLI is sleeping on a plan-window usage limit. Only meaningful
   *  while `status === "running"`. */
  paused_until?: string;
}

export type SchedulePreset =
  | "every_30min"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export const SCHEDULE_PRESET_LABELS: Record<SchedulePreset, string> = {
  every_30min: "Every 30 minutes",
  hourly: "Every hour",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  custom: "Custom",
};
