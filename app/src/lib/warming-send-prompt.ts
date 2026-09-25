/**
 * What a queued warming send puts on the wire, and when that is decided.
 *
 * A send parked during the warm-up is persisted in the provisioning entry's
 * localStorage mirror, but a prompt BUILDER is a closure and a relaunch loses
 * it. Two kinds of builder exist and only one survives, which is why they are
 * separate inputs rather than one:
 *
 *  - A setup kickoff (the agent's self-setup mission, the routine / skill /
 *    integration setup chats) is pure and synchronous, and on the warming path
 *    the activity id is decided client-side before anything is queued — so the
 *    whole prompt is already known. It is resolved at queue time and stored as
 *    `prompt`, which the mirror carries. These sends have an EMPTY `text` (the
 *    user typed nothing; the message is entirely hidden), so without it a
 *    relaunch would leave `""` as the only candidate — a turn the runtime
 *    refuses, i.e. a mission that silently never runs.
 *  - An attachment prompt saves the files through the engine first. Running it
 *    at queue time would be a held request against the pod that is still
 *    coming up — exactly what the queue exists to avoid — so it stays a
 *    closure, runs at flush, and after a relaunch the send falls back to the
 *    user's own words (they are the message; only the file refs are lost).
 *
 * When neither candidate survives there is nothing to send, and what the flush
 * owes the mission instead is {@link undeliverableSend}.
 *
 * Kept dependency-free (type-only imports) so `node --test` can exercise it.
 */

import type { ActivityStatus, MessageMention } from "@houston/engine-adapter";
import type { PendingWarmingSend } from "./agent-provisioning/entry";

/** The persistable half of a queued send: everything but the closures. */
export interface WarmingSendInput {
  sessionKey: string;
  /** What the user typed — the bubble, and the last-resort wire prompt. */
  text: string;
  /** The wire prompt, already resolved (a setup kickoff, see above). */
  prompt?: string;
  /** Board row for a NEW conversation's first message (created at flush). */
  row?: PendingWarmingSend["row"];
  provider?: string;
  model?: string;
  effort?: string;
  mode?: PendingWarmingSend["mode"];
  /** Teammates this message @mentions (HOU-944) — chipped on the local bubble
   *  now, shipped with the deferred send at flush. */
  mentions?: MessageMention[];
  /** Set = run the async AI title pass on this text once the flush lands. */
  titleText?: string;
  /** Row-only entry: no bubble now, no wire send at flush (HOU-713). */
  rowOnly?: boolean;
}

/** Build the record the provisioning entry (and its mirror) carries. */
export function warmingSendRecord(input: WarmingSendInput): PendingWarmingSend {
  return {
    id: crypto.randomUUID(),
    sessionKey: input.sessionKey,
    text: input.text,
    prompt: input.prompt,
    row: input.row,
    provider: input.provider,
    model: input.model,
    effort: input.effort,
    mode: input.mode,
    mentions: input.mentions,
    queuedAt: Date.now(),
    titleText: input.titleText,
    rowOnly: input.rowOnly,
  };
}

/** Where the prompt on the wire came from. `"text"` = the user's own words,
 *  the only source the bubble already shows verbatim. */
export type WarmingPromptSource = "builder" | "persisted" | "text";

export interface WarmingPromptChoice {
  prompt: string;
  source: WarmingPromptSource;
}

/**
 * The prompt this send delivers: the live builder's result (it ran just now,
 * with the attachments it saved), else the prompt resolved at queue time, else
 * the user's words. `null` means there is nothing to send at all — the caller
 * must report and skip rather than put an empty turn on the wire.
 */
export function chooseWarmingPrompt(
  send: Pick<PendingWarmingSend, "text" | "prompt">,
  built: string | undefined,
): WarmingPromptChoice | null {
  if (built) return { prompt: built, source: "builder" };
  if (send.prompt) return { prompt: send.prompt, source: "persisted" };
  if (send.text) return { prompt: send.text, source: "text" };
  return null;
}

/** What the flush owes a send `chooseWarmingPrompt` refused. */
export interface UndeliverableSend {
  /** The diagnostic the report carries. */
  reason: string;
  /**
   * The mission row to settle, or null when this send created none (a parked
   * follow-up, or a create that failed). A created row carries the default
   * `running` status and only a turn ever moves it — and the turn that would
   * have is the one with no prompt, so the card spins over an empty chat
   * forever unless the mission is handed back to the user.
   */
  settleRow: { id: string; status: ActivityStatus } | null;
}

export function undeliverableSend(
  send: Pick<PendingWarmingSend, "sessionKey">,
  rowId: string | null,
): UndeliverableSend {
  return {
    reason: `queued send has no prompt to deliver (session ${send.sessionKey})`,
    settleRow: rowId ? { id: rowId, status: "needs_you" } : null,
  };
}
