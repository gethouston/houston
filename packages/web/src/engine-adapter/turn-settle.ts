import type {
  ChatMessage,
  ProviderError,
  TokenUsage,
} from "@houston/runtime-client";
import { feed, sessionStatus, type TerminalBoardStatus } from "./feed-events";
import { toOldProvider } from "./synthetic";
import { isNotConnectedError, isStoppedByUser } from "./translate";

/**
 * A turn that died without persisting a reply — the same copy the host's
 * dead-pump reaper stamps on the terminal `error` frame it synthesizes
 * (`packages/host/src/turn/relay-dialect.ts` TURN_DIED_MESSAGE), so the
 * surface reads identically whether the server or this client detected it.
 */
export const TURN_DIED_MESSAGE = "The turn ended unexpectedly";

/** One streamed turn's accumulation + settle state (owned by TurnSink). */
export interface TurnState {
  agentPath: string;
  sessionKey: string;
  text: string;
  thinking: string;
  usage: TokenUsage | null;
  settled: boolean;
  terminal: TerminalBoardStatus | null;
}

export function newTurnState(agentPath: string, sessionKey: string): TurnState {
  return {
    agentPath,
    sessionKey,
    text: "",
    thinking: "",
    usage: null,
    settled: false,
    terminal: null,
  };
}

/** Emit one FeedItem for this turn's session — the sink and settles share it. */
export const push = (s: TurnState, item: unknown): void =>
  feed(s.agentPath, s.sessionKey, item);

const invisibleFinal = (s: TurnState) =>
  push(s, {
    feed_type: "final_result",
    data: { result: "", cost_usd: null, duration_ms: null, usage: null },
  });

/** Settle a successful turn: flush accumulations, final_result, completed. */
export function finishOk(s: TurnState): void {
  if (s.settled) return;
  s.settled = true;
  if (s.thinking) push(s, { feed_type: "thinking", data: s.thinking });
  if (s.text) push(s, { feed_type: "assistant_text", data: s.text });
  push(s, {
    feed_type: "final_result",
    data: { result: s.text, cost_usd: null, duration_ms: null, usage: s.usage },
  });
  sessionStatus(s.agentPath, s.sessionKey, "completed");
  s.terminal = "needs_you";
}

/**
 * Settle an errored turn. A user Stop or a logged-out provider is a HANDLED
 * state (the message drives the in-chat surface): an invisible final_result
 * stops the progress line, an `error` status (with text only for
 * not-connected, which the reconnect card reads) clears the loading flag, and
 * the card lands on needs_you — never the red error state. Anything else is a
 * real failure.
 */
export function finishErr(s: TurnState, msg: string): void {
  if (s.settled) return;
  s.settled = true;
  push(s, { feed_type: "system_message", data: msg });
  if (isStoppedByUser(msg) || isNotConnectedError(msg)) {
    invisibleFinal(s);
    sessionStatus(
      s.agentPath,
      s.sessionKey,
      "error",
      isNotConnectedError(msg) ? msg : undefined,
    );
    s.terminal = "needs_you";
    return;
  }
  sessionStatus(s.agentPath, s.sessionKey, "error", msg);
  s.terminal = "error";
}

/**
 * The turn's terminal surface for a typed provider failure — the runtime does
 * NOT emit a clean `done` after one (that would settle the chat as a success).
 * The typed card IS the message (no system_message); settle like the
 * not-connected path: invisible final_result, `error` status with no text,
 * card on needs_you.
 */
export function settleProviderErrorCard(
  s: TurnState,
  err: ProviderError,
): void {
  push(s, {
    feed_type: "provider_error",
    data: { ...err, provider: toOldProvider(err.provider) },
  });
  if (s.settled) return;
  s.settled = true;
  invisibleFinal(s);
  sessionStatus(s.agentPath, s.sessionKey, "error");
  s.terminal = "needs_you";
}

/**
 * Settle a turn whose terminal frame was lost (the reconnect resynced and the
 * turn is over). Persisted history is complete once a turn ends, so with a
 * known `turnId` the settle is exact: adopt the assistant message persisted
 * FOR THIS TURN (text/usage/providerError); no such message means the turn
 * died before persisting a reply — an error surface with the server's own
 * dead-turn copy, NEVER an empty "completed" render.
 *
 * Without turn ids (legacy servers / old histories) fall back to the trailing
 * assistant message gated by `guard` — a heuristic with a known weakness:
 * turn mode matches the newest user message against the prompt, so two
 * identical prompts in a row can adopt the PREVIOUS turn's reply. When the
 * guard rejects, the streamed accumulation is all there is: settle it as
 * completed when text was streamed, else as the dead-turn error.
 */
export function settleFromHistory(
  s: TurnState,
  messages: ChatMessage[] | null,
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
): void {
  if (messages && turnId) {
    const reply = messages.find(
      (m) => m.role === "assistant" && m.turnId === turnId,
    );
    if (reply) {
      adoptReply(s, reply);
      return;
    }
    finishErr(s, TURN_DIED_MESSAGE);
    return;
  }
  if (messages) {
    // Legacy fallback: no turn ids anywhere — trailing reply + guard.
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && guard(messages)) {
      adoptReply(s, last);
      return;
    }
  }
  // History reload failed, or the legacy guard rejected the trailing reply:
  // the streamed accumulation is all there is.
  if (s.text) finishOk(s);
  else finishErr(s, TURN_DIED_MESSAGE);
}

function adoptReply(s: TurnState, reply: ChatMessage): void {
  if (reply.providerError) {
    settleProviderErrorCard(s, reply.providerError);
    return;
  }
  s.text = reply.content;
  if (reply.usage) s.usage = reply.usage;
  finishOk(s);
}

/**
 * Refetch history and settle from it (`settleFromHistory`), then stop the
 * subscription. A failed reload surfaces as a system message (no silent
 * fallback) and the settle proceeds from the streamed accumulation — the UI
 * must never hang.
 */
export async function reloadAndSettle(
  s: TurnState,
  reloadHistory: () => Promise<ChatMessage[]>,
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
  stop: () => void,
): Promise<void> {
  let messages: ChatMessage[] | null = null;
  try {
    messages = await reloadHistory();
  } catch (e) {
    push(s, {
      feed_type: "system_message",
      data: `Couldn't reload the conversation: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
  if (!s.settled) settleFromHistory(s, messages, turnId, guard);
  stop();
}
