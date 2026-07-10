// Routine types — mirrors Houston's new file-backed Routine model.

import type { ReactNode } from "react";

/**
 * Whether a routine's runs share one chat or each start a fresh one.
 * `"shared"` (the default) keeps one chat per routine; `"per_run"` surfaces
 * each run in its own chat.
 */
export type RoutineChatMode = "shared" | "per_run";

/**
 * An event binding that wakes a routine on an external Composio trigger instead
 * of a cron `schedule` (C9 event-driven routines). Mirrors the engine-client
 * `RoutineTriggerBinding`; kept as its own type here so `ui/` stays free of
 * app/engine imports. Exactly one of `schedule`/`trigger` is set on a routine.
 */
export interface RoutineTriggerBinding {
  /** Composio toolkit slug, e.g. "gmail". */
  toolkit: string;
  /** Trigger type slug, e.g. "GMAIL_NEW_GMAIL_MESSAGE". */
  trigger_slug: string;
  /** Instance filter object, validated server-side against the type's schema. */
  trigger_config: Record<string, unknown>;
  /** Pinned only when the user has more than one connected account for the toolkit. */
  connected_account_id?: string;
}

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
 * routine (`AiRoutineStep`). The Routines tab itself no longer uses this
 * shape — editing an existing routine there patches `name`/`schedule`/`prompt`
 * directly (see `RoutineRow`'s inline edit panel).
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
 * One entry in a toolkit's trigger catalog: an event a routine can wake on.
 * `type` splits latency classes: `webhook` is near-realtime, `poll` carries
 * minutes of inherent delay (surfaced in the UI copy). `config` is the JSON
 * schema for the instance filters the user fills in. Opaque to `ui/` beyond the
 * pure schema→fields mapper in `trigger-config-schema.ts`.
 */
export interface TriggerType {
  slug: string;
  name: string;
  description?: string;
  type: "poll" | "webhook";
  config: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

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

/** The wake mechanism the routine editor commits on Save. */
export interface RoutineEditPatch {
  name: string;
  prompt: string;
  wake: RoutineWake;
}

/**
 * Props the routine editor hands the app-injected trigger editor slot: the
 * current binding (or null) and a change callback carrying the binding plus
 * whether it is complete/valid (so the editor can gate Save without re-deriving
 * the config schema).
 */
export interface TriggerEditorSlotProps {
  value: RoutineTriggerBinding | null;
  onChange: (binding: RoutineTriggerBinding | null, valid: boolean) => void;
}

/** Renders the app-wired trigger editor (picker + config form) into the editor. */
export type RenderTriggerEditor = (props: TriggerEditorSlotProps) => ReactNode;
