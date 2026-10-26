import type { ProviderError } from "@houston/runtime-client";
import type { MessageLimitRefusal } from "@houston/wire-types";
import { settleCard } from "./reply-phase";
import { providerErrorClass } from "./turn-error-class";
import type { EngineNoticeKind } from "./turn-errors";
import { isNotConnectedError, isStoppedByUser } from "./turn-errors";
import { emitStatus, type TurnState, turnErrorClass } from "./turn-state";

/**
 * The live-frame settles. The turn state they drive is turn-state.ts; the
 * lost-terminal-frame settle path (history reload) is settle-from-history.ts.
 */

export { newTurnState, type TurnState } from "./turn-state";

/** Emit one FeedItem for this turn's session — the sink and settles share it.
 *  Stamps the turn's id (once adopted) so the VM fold dedupes re-delivered
 *  content by identity (HOU-1214); an item never carries its own. */
export const push = (s: TurnState, item: object): void => {
  s.output.pushFeedItem(
    s.agentPath,
    s.sessionKey,
    s.turnId === undefined ? item : { ...item, turnId: s.turnId },
  );
  s.firstResponse?.pushed(item, s.turnId);
};

/** A final_result with nothing in it: stops the progress line. */
export const invisibleFinal = (s: TurnState) =>
  push(s, {
    feed_type: "final_result",
    data: { result: "", cost_usd: null, duration_ms: null, usage: null },
  });

/**
 * Settle a completed reply or expected time limit: flush accumulations,
 * final_result, completed. The board always lands on `needs_you`. Only the
 * user closes a mission: a finished turn parks its card where the user can
 * read the result and decide, so nothing is auto-archived out from under them.
 *
 * There is no split on the captured interaction any more. Blocking or not
 * (ask_user / request_connection / plan_ready, or a pure `suggest_actions` /
 * `suggest_reusable` offer), `s.pendingInteraction` still rides the terminal
 * board persist untouched, so the card renders its question/connect card or its
 * suggestion bubbles — and the suggestions survive the user's later move to
 * done.
 */
export function finishOk(
  s: TurnState,
  notice?: {
    kind: "turn_time_limit" | "turn_time_limit_unsaved";
    message: string;
  },
): void {
  if (s.settled) return;
  s.settled = true;
  if (s.thinking) push(s, { feed_type: "thinking", data: s.thinking });
  if (s.text) push(s, { feed_type: "assistant_text", data: s.text });
  if (notice) s.pendingInteraction = null;
  if (notice)
    push(s, {
      feed_type: "system_message",
      data: notice.message,
      notice: notice.kind,
    });
  push(s, {
    feed_type: "final_result",
    data: { result: s.text, cost_usd: null, duration_ms: null, usage: s.usage },
  });
  s.firstResponse?.resolve("no_text", s.turnId);
  settleCard(s, "needs_you");
  emitStatus(s, "completed", undefined, undefined, notice?.kind);
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
export function finishErr(
  s: TurnState,
  msg: string,
  notice?: EngineNoticeKind,
  /** Why, for reports only (a setup code, `gone`): never rendered. */
  cause?: string,
): void {
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
    ...(notice ? { notice } : {}),
    ...(cause ? { cause } : {}),
    ...(failsSend ? { fails_pending: true } : {}),
  });
  s.firstResponse?.resolve(
    isStoppedByUser(msg)
      ? "cancelled"
      : notice === "engine_restart"
        ? "interrupted"
        : "error",
    s.turnId,
  );
  if (isStoppedByUser(msg)) {
    invisibleFinal(s);
    settleCard(s, "needs_you");
    emitStatus(s, "error", undefined, "stopped");
    return;
  }
  settleCard(s, "error");
  emitStatus(s, "error", msg, turnErrorClass(msg, notice));
}

/** A gateway plan refusal is a handled, typed card; the send never reached the engine. */
export function finishPlanLimit(
  s: TurnState,
  refusal: MessageLimitRefusal,
): void {
  settleProviderErrorCard(s, {
    kind: "plan_message_limit",
    provider: "",
    resets_at: refusal.resetsAt,
    message: refusal.error,
    ...(refusal.scope ? { scope: refusal.scope } : {}),
  });
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
  // Finalize whatever streamed before the failure (mirrors finishOk): the
  // partial reply must stop rendering as "still streaming", and the card must
  // land BELOW it — the terminal card is the last thing in the transcript, so
  // the user sees the turn is over (PRODUCT-1578). Skipped once settled: an
  // extra late provider_error frame only refreshes the card.
  if (!s.settled) {
    if (s.thinking) push(s, { feed_type: "thinking", data: s.thinking });
    if (s.text) push(s, { feed_type: "assistant_text", data: s.text });
  }
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
  s.firstResponse?.resolve("error", s.turnId);
  invisibleFinal(s);
  settleCard(s, "needs_you");
  emitStatus(s, "error", undefined, providerErrorClass(err.kind));
}
