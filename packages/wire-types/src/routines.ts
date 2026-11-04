/**
 * Routine wire shapes (protocol v3): the routine document, its create and
 * update payloads, and its run rows. Re-exported from `./types`.
 */

import type { RoutineAutoPause, RoutineSnooze } from "@houston/protocol";

/**
 * Whether a routine's runs share one chat or each start a fresh one.
 * `"shared"` (the default) keeps one chat per routine; `"per_run"` surfaces
 * each run in its own chat.
 */
export type RoutineChatMode = "shared" | "per_run";

/**
 * An event binding that wakes a routine on an external Composio trigger instead
 * of a cron `schedule` (C9 event-driven routines). `toolkit` + `trigger_slug`
 * name the trigger type (e.g. `gmail` / `GMAIL_NEW_GMAIL_MESSAGE`);
 * `trigger_config` is the instance filter object, validated server-side against
 * the trigger type's config JSON-schema. `connected_account_id` is pinned only
 * when the user has more than one connected account for the toolkit; absent, the
 * reconciler resolves the single active one. The `kind` discriminant is optional
 * for backward compatibility: absent means Composio (the original shape).
 */
export interface ComposioTriggerBinding {
  /** Discriminant. Absent means Composio (the pre-webhook shape). */
  kind?: "composio";
  toolkit: string;
  trigger_slug: string;
  trigger_config: Record<string, unknown>;
  connected_account_id?: string;
}

/**
 * An event binding that wakes a routine when an external system POSTs to the
 * routine's minted webhook URL (hosted-cloud-only backend). The URL + secret are
 * minted separately (see `mintRoutineWebhookKey`) and NEVER live in routine data;
 * `key_prefix` is a display-only "wh_xxxxxxxx" label stamped after minting so the
 * UI can show a key exists. Absent `key_prefix` = not minted yet (status pending).
 */
export interface WebhookTriggerBinding {
  /** Discriminant — REQUIRED (absent would read as Composio). */
  kind: "webhook";
  /** Display-only "wh_xxxxxxxx" label of the minted key; the secret is never
   *  stored here. Absent until a key is minted. */
  key_prefix?: string;
}

/**
 * A routine's external-event wake binding, instead of a cron `schedule`. Exactly
 * one of `schedule` / `trigger` is set (enforced server-side). Discriminated on
 * `kind`: absent or "composio" => {@link ComposioTriggerBinding}, "webhook" =>
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
   * What the scheduler wakes this routine on: a cron expression, or
   * `@every <N>m` / `@every <N>h` for a true interval counted from the Unix
   * epoch (only when N does not divide 60 or 24; an even cadence is stored as
   * cron). Absent when the routine is event-driven (`trigger` set instead) —
   * exactly one of `schedule`/`trigger` is present.
   */
  schedule?: string;
  /**
   * Event binding that wakes this routine on an external Composio event (C9),
   * instead of `schedule`. Exactly one of the two is set.
   */
  trigger?: RoutineTriggerBinding;
  enabled: boolean;
  suppress_when_silent: boolean;
  /** Whether each run reuses one chat or starts a fresh one. */
  chat_mode: RoutineChatMode;
  /** Composio toolkit slugs this routine uses (e.g. ["gmail", "slack"]). */
  integrations: string[];
  /** Provider id override (e.g. "anthropic", "openai"); absent means inherit the agent's provider. */
  provider?: string | null;
  /** Model override (e.g. "claude-opus-4-8", "gpt-5.5"); absent means inherit the agent's model. */
  model?: string | null;
  /** Reasoning-effort override (e.g. "high", "max"); absent means inherit the agent's effort. */
  effort?: string | null;
  /**
   * Id of the setup-chat activity attached to this routine — the persistent
   * conversation shown next to the routine form.
   */
  setup_activity_id?: string;
  /**
   * Multiplayer only: the org-member user id that created this routine. Absent
   * in single-player mode. Surfaced so the UI can attribute automations.
   */
  created_by?: string;
  /**
   * Set when the engine paused this routine itself (`enabled` false) after its
   * latest runs kept failing on the same account or model problem. Resuming
   * (`enabled: true`) clears it; an update never writes it.
   */
  auto_paused?: RoutineAutoPause;
  /**
   * The engine is holding this routine's fires until a plan usage limit
   * resets (`enabled` stays true). Server-owned like `auto_paused`: an update
   * never writes it; a new model or provider, or a resume, removes it; past
   * `until` it is inert.
   */
  snoozed?: RoutineSnooze;
  created_at: string;
  updated_at: string;
}

export interface NewRoutine {
  name: string;
  prompt: string;
  /** Cron expression or `@every <N>m` / `@every <N>h` interval to wake on; omit
   *  when creating an event-driven routine (pass `trigger` instead). Exactly one
   *  of `schedule`/`trigger` is set. */
  schedule?: string;
  /** Event binding to wake on instead of a cron schedule (C9). Exactly one of
   *  `schedule`/`trigger` is set. */
  trigger?: RoutineTriggerBinding;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  /** Defaults to `"shared"` (one chat per routine) when omitted. */
  chat_mode?: RoutineChatMode;
  /** Composio toolkit slugs this routine uses. */
  integrations?: string[];
  /** Provider id to pin (e.g. "openai"); omit to inherit the agent's provider. */
  provider?: string | null;
  /** On create with no model, Anthropic defaults to claude-sonnet-5-5 and
   *  openai-codex to gpt-6.1-terra, with an effort that model serves.
   *  Other providers inherit the agent's model. An explicit model wins. */
  model?: string | null;
  /** Reasoning effort to pin (e.g. "high"). When create selects a routine
   *  default model, the inherited or requested effort is clamped to a served
   *  level. Otherwise omit to inherit the agent's effort. */
  effort?: string | null;
  /** Setup-chat activity to attach; omit for routines created without a chat. */
  setup_activity_id?: string;
}

export interface RoutineUpdate {
  name?: string;
  prompt?: string;
  /** Switch to (or keep) a schedule wake (cron or `@every` interval); pair with
   *  `trigger: null` to move a routine off an event binding. Exactly one of
   *  `schedule`/`trigger` ends set. */
  schedule?: string;
  /** Switch to (or keep) an event wake; pass `null` to move the routine back to a
   *  cron `schedule`. Omit to leave the current wake mechanism unchanged. */
  trigger?: RoutineTriggerBinding | null;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  chat_mode?: RoutineChatMode;
  integrations?: string[];
  /** Provider id to pin (e.g. "openai"); omit or null to leave unchanged. */
  provider?: string | null;
  /** Model to pin (e.g. "gpt-5.5"); omit or null to leave unchanged. */
  model?: string | null;
  /** Reasoning effort to pin (e.g. "high"); omit or null to leave unchanged. */
  effort?: string | null;
  /** Attach a setup-chat activity to this routine; omit to leave unchanged. */
  setup_activity_id?: string;
}
