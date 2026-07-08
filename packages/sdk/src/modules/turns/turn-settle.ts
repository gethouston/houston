import type {
  PendingInteraction,
  ProviderError,
  TokenUsage,
} from "@houston/runtime-client";
import type { FeedOutput, TerminalBoardStatus } from "./feed-output";
import { isNotConnectedError, isStoppedByUser } from "./turn-errors";

/**
 * The turn state + live-frame settles. The lost-terminal-frame settle path
 * (history reload) lives in settle-from-history.ts.
 */

/** One streamed turn's accumulation + settle state (owned by TurnSink). */
export interface TurnState {
  agentPath: string;
  sessionKey: string;
  /** Where every FeedItem / SessionStatus for this turn is emitted. */
  output: FeedOutput;
  /**
   * The provider this chat INTENDED to run on (the composer's pick, in the
   * caller's id dialect). The runtime can't name one in its not-connected
   * refusal — nothing is connected — so the reconnect card is labeled with
   * this instead. Null when the caller had no pick (observer mode, no
   * per-turn switch): the surface falls back to the chat's own provider.
   */
  provider: string | null;
  /** The turn's prompt — carried on the not-connected card so "Send again"
   *  can resend the exact text the runtime refused (it was never delivered). */
  prompt: string | null;
  text: string;
  thinking: string;
  /**
   * How many of this turn's `tool_call` feed items were already pushed (live
   * frames + sync replay) — the dedup cursor a running `sync`'s tool replay
   * starts from, so a resync never doubles a tool row (HOU-717).
   */
  toolsSeen: number;
  /** Same cursor for `tool_result` pushes. */
  toolResultsSeen: number;
  usage: TokenUsage | null;
  settled: boolean;
  terminal: TerminalBoardStatus | null;
  /**
   * The interaction the turn ended on (ask_user / request_connection), captured
   * from the clean `done` frame; `null` when the turn settled without one. It
   * splits a clean settle to `needs_you` (present) vs `done` (absent) in
   * {@link finishOk} and rides the terminal board persist so the card can
   * render its composer-replacing question/connect card. Handled non-success
   * settles (user Stop, provider error) never set it.
   */
  pendingInteraction: PendingInteraction | null;
  /**
   * Whether the send was ever confirmed to REACH the engine — the send returned
   * 202, our nonce echo came back, or the turn produced any frame / running
   * sync. The sink sets it; the settles read it. An error settle with
   * `delivered === false` means the message provably never landed (lost /
   * rejected / refused), so its optimistic bubble is failed rather than
   * confirmed. An AMBIGUOUS transport failure does NOT set it — only the
   * verdict window's independent evidence does.
   */
  delivered: boolean;
}

export function newTurnState(
  agentPath: string,
  sessionKey: string,
  output: FeedOutput,
  send?: { provider?: string; prompt?: string },
): TurnState {
  return {
    agentPath,
    sessionKey,
    output,
    provider: send?.provider ?? null,
    prompt: send?.prompt ?? null,
    text: "",
    thinking: "",
    toolsSeen: 0,
    toolResultsSeen: 0,
    usage: null,
    settled: false,
    terminal: null,
    pendingInteraction: null,
    delivered: false,
  };
}

/** Emit one FeedItem for this turn's session — the sink and settles share it. */
export const push = (s: TurnState, item: unknown): void =>
  s.output.pushFeedItem(s.agentPath, s.sessionKey, item);

const invisibleFinal = (s: TurnState) =>
  push(s, {
    feed_type: "final_result",
    data: { result: "", cost_usd: null, duration_ms: null, usage: null },
  });

/**
 * Settle a successful turn: flush accumulations, final_result, completed. The
 * board split is on the captured interaction (the `done` frame stashes it into
 * `s.pendingInteraction` before calling here): the turn ended asking the user
 * for something → `needs_you`; it ended with nothing outstanding → `done`.
 */
export function finishOk(s: TurnState): void {
  if (s.settled) return;
  s.settled = true;
  if (s.thinking) push(s, { feed_type: "thinking", data: s.thinking });
  if (s.text) push(s, { feed_type: "assistant_text", data: s.text });
  push(s, {
    feed_type: "final_result",
    data: { result: s.text, cost_usd: null, duration_ms: null, usage: s.usage },
  });
  s.output.sessionStatus(s.agentPath, s.sessionKey, "completed");
  s.terminal = s.pendingInteraction ? "needs_you" : "done";
}

/**
 * Settle an errored turn. A user Stop or a logged-out provider is a HANDLED
 * state: an invisible final_result stops the progress line, an `error` status
 * clears the loading flag, and the card lands on needs_you — never the red
 * error state. Anything else is a real failure.
 *
 * A logged-out provider refuses the SEND itself (409), so the message never
 * reached the engine. That settles as the typed `unauthenticated` card — the
 * stable inline reconnect surface with the reconnected → "Send again"
 * lifecycle — NOT as a raw system message: the message-driven ephemeral card
 * auto-dismisses the moment the provider reconnects, dead-ending the
 * undelivered prompt with no reply and no affordance (HOU-676). The card
 * carries the refused prompt so "Send again" resends it verbatim.
 */
export function finishErr(s: TurnState, msg: string): void {
  if (s.settled) return;
  if (isNotConnectedError(msg)) {
    const card: ProviderError & { failed_prompt?: string } = {
      kind: "unauthenticated",
      // Empty when the caller had no pick — the surface resolves it to the
      // chat's own provider (the runtime can't name one: nothing is connected).
      provider: s.provider ?? "",
      cause: "no_credentials",
      message: msg,
    };
    if (s.prompt) card.failed_prompt = s.prompt;
    settleProviderErrorCard(s, card);
    return;
  }
  s.settled = true;
  // Fail the optimistic bubble when the send never reached the engine (a lost /
  // rejected send: `!delivered`) — never on a user Stop (a HANDLED settle: the
  // message DID reach the agent, then the user cancelled). For a delivered turn
  // that later errors, `failPending` is a no-op — server frames already
  // confirmed the bubble — so this only ever bites a send with no evidence.
  const failsSend = !s.delivered && !isStoppedByUser(msg);
  push(s, {
    feed_type: "system_message",
    data: msg,
    ...(failsSend ? { fails_pending: true } : {}),
  });
  if (isStoppedByUser(msg)) {
    invisibleFinal(s);
    s.output.sessionStatus(s.agentPath, s.sessionKey, "error");
    s.terminal = "needs_you";
    return;
  }
  s.output.sessionStatus(s.agentPath, s.sessionKey, "error", msg);
  s.terminal = "error";
}

/**
 * The turn's terminal surface for a typed provider failure — the runtime does
 * NOT emit a clean `done` after one (that would settle the chat as a success).
 * The typed card IS the message (no system_message); settle like the
 * user-stop path: invisible final_result, `error` status with no text,
 * card on needs_you. `failed_prompt` rides along only on the client-built
 * not-connected card (see {@link finishErr}) — never on a wire frame.
 */
export function settleProviderErrorCard(
  s: TurnState,
  err: ProviderError & { failed_prompt?: string },
): void {
  // A card for a refused SEND (the not-connected path, `!delivered` — the prompt
  // never left) fails the optimistic bubble; a mid-turn typed provider error is
  // `delivered` (frames arrived first), so the flag is omitted and the bubble
  // stays confirmed.
  push(s, {
    feed_type: "provider_error",
    data: { ...err },
    ...(s.delivered ? {} : { fails_pending: true }),
  });
  if (s.settled) return;
  s.settled = true;
  invisibleFinal(s);
  s.output.sessionStatus(s.agentPath, s.sessionKey, "error");
  s.terminal = "needs_you";
}
