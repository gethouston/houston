import {
  accountBlockedCard,
  providerAccountBlockedRefusal,
} from "./account-blocked-refusal";
import { SEND_IN_FLIGHT_MESSAGE } from "./stream-tuning";
import { messageLimitRefusal } from "./turn-errors";
import { sendRefusal } from "./turn-running";
import type { TurnSink } from "./turn-sink";

/**
 * One reading of a refused send for the two places it lands. The gateway's
 * typed refusals come first (a plan's message limit, a provider that locked
 * the account's billing), each its own card; everything else is the engine's
 * plain message, or the product-voice fallback, as a system line.
 */

/** Settle the fresh send's sink with the refusal. */
export function settleRefusedSend(sink: TurnSink, e: unknown): void {
  const limit = messageLimitRefusal(e);
  if (limit) {
    sink.planLimit(limit);
    return;
  }
  const blocked = providerAccountBlockedRefusal(e);
  if (blocked) {
    sink.accountBlocked(blocked);
    return;
  }
  const refusal = sendRefusal(e);
  sink.fail(refusal.message, refusal.notice);
}

/**
 * The feed item for a held message's re-send the engine refused: the observed
 * turn keeps rendering, so the refusal lands as its own item, failing the
 * optimistic bubble.
 */
export function refusedResendItem(e: unknown): unknown {
  const limit = messageLimitRefusal(e);
  if (limit)
    return {
      feed_type: "provider_error",
      data: {
        kind: "plan_message_limit",
        provider: "",
        resets_at: limit.resetsAt,
        message: limit.error,
        ...(limit.scope ? { scope: limit.scope } : {}),
      },
      fails_pending: true,
    };
  const blocked = providerAccountBlockedRefusal(e);
  if (blocked)
    return {
      feed_type: "provider_error",
      data: accountBlockedCard(blocked, undefined),
      fails_pending: true,
    };
  const refusal = sendRefusal(e);
  return {
    feed_type: "system_message" as const,
    data: refusal.message,
    ...(refusal.notice ? { notice: refusal.notice } : {}),
    fails_pending: true,
  };
}

/**
 * The feed item for a duplicate send, refused before it went out: it never
 * sent a second turn, so its optimistic bubble fails and never reads as
 * delivered. The first turn keeps rendering.
 */
export const duplicateSendItem = {
  feed_type: "system_message",
  data: SEND_IN_FLIGHT_MESSAGE,
  fails_pending: true,
} as const;
