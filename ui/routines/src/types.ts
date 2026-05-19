// Routine types — mirrors Houston's new file-backed Routine model.

export interface Routine {
  id: string
  name: string
  description: string
  /** The prompt sent to Claude when this routine fires. */
  prompt: string
  /** Cron expression (e.g. "0 9 * * 1-5"). */
  schedule: string
  enabled: boolean
  /** When true, runs where Claude responds with ROUTINE_OK are auto-completed silently. */
  suppress_when_silent: boolean
  /** IANA timezone override; absent means use the user's account timezone. */
  timezone?: string | null
  /** Composio toolkit slugs this routine uses (e.g. ["gmail", "slack"]). */
  integrations: string[]
  created_at: string
  updated_at: string
}

export type RunStatus = "running" | "silent" | "surfaced" | "error"

export interface RoutineRun {
  id: string
  routine_id: string
  status: RunStatus
  /** Session key for chat history lookup. */
  session_key: string
  /** If surfaced, the activity ID created on the board. */
  activity_id?: string
  /** Brief summary of the run output. */
  summary?: string
  started_at: string
  completed_at?: string
}

export type SchedulePreset =
  | "every_30min"
  | "hourly"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "custom"

export const SCHEDULE_PRESET_LABELS: Record<SchedulePreset, string> = {
  every_30min: "Every 30 minutes",
  hourly: "Every hour",
  daily: "Daily",
  weekdays: "Weekdays only",
  weekly: "Weekly",
  monthly: "Monthly",
  custom: "Custom (cron)",
}
