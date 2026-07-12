// Routines + routine runs. snake_case mirrors the on-disk .houston schemas.

/** Whether a routine's runs share one chat ("shared", default) or each run gets its own ("per_run"). */
export type RoutineChatMode = "shared" | "per_run";

/**
 * Binds a routine to an external event (a Composio trigger) as its wake
 * mechanism instead of a cron schedule. User intent only — no Composio instance
 * ids live here; the gateway/host reconciler owns the actual trigger instance
 * keyed by the routine id. A routine has EXACTLY ONE of `schedule` or `trigger`.
 */
export interface RoutineTriggerBinding {
  /** Composio toolkit slug, e.g. "gmail". */
  toolkit: string;
  /** Composio trigger-type slug, e.g. "GMAIL_NEW_GMAIL_MESSAGE". */
  trigger_slug: string;
  /** Instance config validated against the trigger type's config schema. */
  trigger_config: Record<string, unknown>;
  /** Pinned when the user has >1 connected account for the toolkit. */
  connected_account_id?: string;
}

export interface Routine {
  id: string;
  name: string;
  prompt: string;
  /**
   * Cron expression that wakes this routine. Absent on trigger routines —
   * exactly one of `schedule` / `trigger` is set (enforced in normalizeRoutines).
   */
  schedule?: string;
  /** External-event wake binding. Absent on cron routines (see `schedule`). */
  trigger?: RoutineTriggerBinding;
  enabled: boolean;
  suppress_when_silent: boolean;
  chat_mode: RoutineChatMode;
  /** Provider id override (e.g. "anthropic", "openai"); absent means inherit the agent's provider. */
  provider?: string | null;
  /** Model override (e.g. "claude-opus-4-8", "gpt-5.5"); absent means inherit the agent's model. */
  model?: string | null;
  /** Reasoning-effort override (e.g. "high", "max"); absent means inherit the agent's effort. */
  effort?: string | null;
  /** Integration slugs this routine uses (data carried for store agents). */
  integrations: string[];
  /**
   * Id of the setup-chat activity attached to this routine — the persistent
   * conversation shown next to the routine form. Written by the agent when it
   * creates a routine from chat (the kickoff prompt carries the id), or
   * stamped by the client for form-created routines and modify chats.
   */
  setup_activity_id?: string;
  /**
   * Multiplayer only: the org-member user id that created this routine. Absent
   * in single-player mode. Surfaced so the UI can attribute automations.
   */
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface NewRoutine {
  name: string;
  prompt: string;
  /** Cron expression; supply this OR `trigger`, never both. */
  schedule?: string;
  /** External-event wake binding; supply this OR `schedule`, never both. */
  trigger?: RoutineTriggerBinding;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  chat_mode?: RoutineChatMode;
  /** Provider id to pin (e.g. "openai"); omit to inherit the agent's provider. */
  provider?: string | null;
  /** Model to pin (e.g. "gpt-5.5"); omit to inherit the agent's model. */
  model?: string | null;
  /** Reasoning effort to pin (e.g. "high"); omit to inherit the agent's effort. */
  effort?: string | null;
  integrations?: string[];
  /** Setup-chat activity to attach; omit for routines created without a chat. */
  setup_activity_id?: string;
}

export interface RoutineUpdate {
  name?: string;
  prompt?: string;
  /** Switch to (or edit) a cron wake; clears `trigger` when the routine is saved. */
  schedule?: string;
  /** Switch to (or edit) an event wake; clears `schedule` when the routine is saved. */
  trigger?: RoutineTriggerBinding;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  chat_mode?: RoutineChatMode;
  /** Provider id to pin; `null` clears (back to inherit), omit to leave unchanged. */
  provider?: string | null;
  /** Model to pin; `null` clears (back to inherit), omit to leave unchanged. */
  model?: string | null;
  /** Reasoning effort to pin; `null` clears (back to inherit), omit to leave unchanged. */
  effort?: string | null;
  integrations?: string[];
  /** Attach a setup-chat activity to this routine; omit to leave unchanged. */
  setup_activity_id?: string;
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
