// Routine types — mirrors Houston's new file-backed Routine model.

/**
 * Whether a routine's runs share one chat or each start a fresh one.
 * `"shared"` (the default) keeps one chat per routine; `"per_run"` surfaces
 * each run in its own chat.
 */
export type RoutineChatMode = "shared" | "per_run";

/**
 * A routine's Composio trigger binding. Mirrors the engine-client
 * `ComposioTriggerBinding`; kept as its own type here so `ui/` stays free of
 * app/engine imports. The `kind` discriminant is optional for backward
 * compatibility — absent means Composio (the original, pre-webhook shape).
 */
export interface ComposioTriggerBinding {
  /** Discriminant. Absent means Composio. */
  kind?: "composio";
  /** Composio toolkit slug, e.g. "gmail". */
  toolkit: string;
  /** Trigger type slug, e.g. "GMAIL_NEW_GMAIL_MESSAGE". */
  trigger_slug: string;
  /** Instance filter object, validated server-side against the type's schema. */
  trigger_config: Record<string, unknown>;
  /** Pinned only when the user has more than one connected account for the toolkit. */
  connected_account_id?: string;
}

/**
 * A routine's incoming-webhook binding: any external system that POSTs to the
 * routine's minted URL wakes it. The URL + secret are minted separately and
 * never live in routine data; `key_prefix` is a display-only "wh_xxxxxxxx" label
 * stamped after minting. Absent `key_prefix` = not minted yet.
 */
export interface WebhookTriggerBinding {
  /** Discriminant — REQUIRED (absent would read as Composio). */
  kind: "webhook";
  /** Display-only "wh_xxxxxxxx" label; the secret is never stored here. */
  key_prefix?: string;
}

/**
 * An event binding that wakes a routine instead of a cron `schedule` (C9
 * event-driven routines). Exactly one of `schedule`/`trigger` is set on a
 * routine. Discriminated on `kind`: absent or "composio" =>
 * `ComposioTriggerBinding`, "webhook" => `WebhookTriggerBinding`.
 */
export type RoutineTriggerBinding =
  | ComposioTriggerBinding
  | WebhookTriggerBinding;

export interface Routine {
  id: string;
  name: string;
  /** The prompt sent to Claude when this routine fires. */
  prompt: string;
  /** Cron expression (e.g. "0 9 * * 1-5"). Absent for an event-driven routine. */
  schedule?: string;
  /** Event binding that wakes this routine instead of `schedule` (C9). Exactly
   *  one of `schedule`/`trigger` is set. */
  trigger?: RoutineTriggerBinding;
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
  /** Id of the setup-chat activity attached to this routine, if any. */
  setup_activity_id?: string;
  created_at: string;
  updated_at: string;
}

export type RunStatus =
  | "running"
  | "silent"
  | "surfaced"
  | "error"
  | "cancelled";

/**
 * Why a run failed before the agent ever ran (PRODUCT-1475): the AI account it
 * was going to use is unusable. Mirrors the engine-client wire union rather
 * than importing it, the same way the trigger bindings above do, so `ui/` stays
 * free of app/engine imports. `provider` is a bare id — naming it in the user's
 * language is the app's job.
 */
export interface RoutineRunFailure {
  code:
    | "creator_not_connected"
    | "team_not_connected"
    | "creator_needs_reconnect"
    | "team_needs_reconnect"
    | "out_of_credits";
  /** Provider id, e.g. `"anthropic"`. */
  provider: string;
}

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
  /** Typed reason an `error` run never reached the agent. Absent for every
   *  other failure, whose story is in `summary`. */
  failure?: RoutineRunFailure;
}

/**
 * Form shape used by the "new agent" onboarding wizard's AI-suggested starter
 * routine (`AiRoutineStep`) and the app-owned creation stepper's ScheduleBuilder.
 * The routines surface itself is chat-first — routines are created and changed by
 * asking the agent, not by editing this shape in a grid.
 */
export interface RoutineFormData {
  name: string;
  prompt: string;
  schedule: string;
  suppress_when_silent: boolean;
  /** Whether each run reuses one chat (`"shared"`) or starts a fresh one. */
  chat_mode: RoutineChatMode;
  /** Composio toolkit slugs this routine uses. */
  integrations: string[];
  /** Provider id override. `null`/absent means inherit the agent's provider. */
  provider?: string | null;
  /** Model override. `null`/absent means inherit the agent's model. */
  model?: string | null;
  /** Reasoning-effort override. `null`/absent means inherit the agent's effort. */
  effort?: string | null;
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

// The EVENT side of a routine lives one file over; re-exported here so every
// existing `./types` import keeps working.
export type {
  RoutineEditPatch,
  RoutineWake,
  RoutineWakeMode,
  TriggerApp,
  TriggerAppAccount,
  TriggerStatusItem,
  TriggerStatusState,
} from "./trigger-types";
