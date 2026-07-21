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

/**
 * Form shape used by the "new agent" onboarding wizard's AI-suggested starter
 * routine (`AiRoutineStep`) and the app-owned creation stepper's ScheduleBuilder.
 * The Routines tab itself is chat-first — routines are created and changed by
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

// ── Triggers (C9 event-driven routines) ──────────────────────────────────────

/**
 * How a routine wakes: on a cron `schedule`, or when an external `event`
 * happens (a Composio trigger). The routine editor's segmented choice toggles
 * between the two; exactly one is active per routine.
 */
export type RoutineWakeMode = "schedule" | "event";

/** The wake mechanism the editor commits on save (discriminated on `mode`). */
export type RoutineWake =
  | { mode: "schedule"; schedule: string }
  | { mode: "event"; trigger: RoutineTriggerBinding };

/**
 * A trigger routine's live provisioning status. `active` = delivering;
 * `pending` = reconcile in flight; `paused_disconnected` = the connected account
 * was disconnected (offer Reconnect); `paused_revoked` = the toolkit fell outside
 * the agent's access; `error` = Composio rejected creation or delivery is failing.
 */
export type TriggerStatusState =
  | "active"
  | "pending"
  | "paused_disconnected"
  | "paused_revoked"
  | "error";

/** One routine's trigger status. */
export interface TriggerStatusItem {
  routine_id: string;
  status: TriggerStatusState;
  detail?: string;
}

/** A connectable account for a toolkit, offered when the user has more than one. */
export interface TriggerAppAccount {
  id: string;
  label: string;
}

/** An app the agent can build an event trigger on (connected + allowed). */
export interface TriggerApp {
  toolkit: string;
  name: string;
  logoUrl?: string;
  /** Active connected accounts for this toolkit; a select shows when >1. */
  accounts: TriggerAppAccount[];
}

/** A composed "create/update a routine" input: a name, a prompt, and the wake
 *  mechanism the app-owned stepper collected (a cron schedule or an event). */
export interface RoutineEditPatch {
  name: string;
  prompt: string;
  wake: RoutineWake;
}
