// Routines + routine runs. snake_case mirrors the on-disk .houston schemas.

/** Whether a routine's runs share one chat ("shared", default) or each run gets its own ("per_run"). */
export type RoutineChatMode = "shared" | "per_run";

/**
 * Binds a routine to a Composio trigger as its wake mechanism. User intent
 * only — no Composio instance ids live here; the gateway/host reconciler owns
 * the actual trigger instance keyed by the routine id.
 *
 * The `kind` discriminant is OPTIONAL for backward compatibility: a binding with
 * no `kind` is a Composio binding, so every routine written before webhook wakes
 * existed deserializes unchanged (no migration).
 */
export interface ComposioTriggerBinding {
  /** Discriminant. Absent means Composio (the original, pre-webhook shape). */
  kind?: "composio";
  /** Composio toolkit slug, e.g. "gmail". */
  toolkit: string;
  /** Composio trigger-type slug, e.g. "GMAIL_NEW_GMAIL_MESSAGE". */
  trigger_slug: string;
  /** Instance config validated against the trigger type's config schema. */
  trigger_config: Record<string, unknown>;
  /** Pinned when the user has >1 connected account for the toolkit. */
  connected_account_id?: string;
}

/**
 * Binds a routine to an incoming webhook: any external system that POSTs to the
 * routine's minted URL wakes it. The URL + secret are minted by the gateway (a
 * hosted-cloud-only backend) and NEVER live in routine data — the secret is
 * shown to the user exactly once at mint time. `key_prefix` is a display-only
 * label ("wh_xxxxxxxx") stamped after minting so the UI can show that a key
 * exists; a webhook binding with no `key_prefix` has not been minted yet.
 */
export interface WebhookTriggerBinding {
  /** Discriminant — REQUIRED (absent would deserialize as Composio). */
  kind: "webhook";
  /** Display-only "wh_xxxxxxxx" label of the minted key. The secret itself
   *  never appears in routine data. Absent until a key is minted. */
  key_prefix?: string;
}

/**
 * A routine's external-event wake binding, instead of a cron schedule. A routine
 * has EXACTLY ONE of `schedule` or `trigger`. Discriminated on `kind`: absent or
 * "composio" => {@link ComposioTriggerBinding}, "webhook" =>
 * {@link WebhookTriggerBinding}.
 */
export type RoutineTriggerBinding =
  | ComposioTriggerBinding
  | WebhookTriggerBinding;

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
  /** Switch to (or edit) a cron wake; a real value clears any `trigger`. */
  schedule?: string;
  /** Switch to (or edit) an event wake; a real value clears any `schedule`.
   *  `null` clears only the trigger (pair with `schedule` to move a routine
   *  back to a cron wake); omit to leave the wake mechanism unchanged. */
  trigger?: RoutineTriggerBinding | null;
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
