import type { ProviderError } from "@houston/runtime-client";
import type { MessageLimitRefusal } from "@houston/wire-types";
import { settleCard } from "./reply-phase";
import { providerErrorClass } from "./turn-error-class";
import type { EngineNoticeKind } from "./turn-errors";
import { isNotConnectedError, isStoppedByUser } from "./turn-errors";
import { emitStatus, type TurnState, turnErrorClass } from "./turn-state";

export { newTurnState, type TurnState } from "./turn-state";

export const push = (s: TurnState, item: object): void => {
  s.output.pushFeedItem(
    s.agentPath,
    s.sessionKey,
    s.turnId === undefined ? item : { ...item, turnId: s.turnId },
  );
  s.firstResponse?.pushed(item, s.turnId);
};

export const invisibleFinal = (s: TurnState) =>
  push(s, {
    feed_type: "final_result",
    data: { result: "", cost_usd: null, duration_ms: null, usage: null },
  });

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
  settleCard(s, "needs_you", notice ? undefined : "last_message");
  emitStatus(s, "completed", undefined, undefined, notice?.kind);
}

export function finishErr(
  s: TurnState,
  msg: string,
  notice?: EngineNoticeKind,
  cause?: string,
): void {
  if (s.settled) return;
  if (isNotConnectedError(msg)) {
    const card: ProviderError & { failed_prompt?: string } = {
      kind: "unauthenticated",
      provider: s.provider ?? "",
      cause: "no_credentials",
      message: msg,
    };
    if (s.prompt) card.failed_prompt = s.prompt;
    settleProviderErrorCard(s, card);
    return;
  }
  s.settled = true;
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
      : notice === "engine_restart" || notice === "sandbox_lost"
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

export function settleProviderErrorCard(
  s: TurnState,
  err: ProviderError & { failed_prompt?: string },
): void {
  if (!s.settled) {
    if (s.thinking) push(s, { feed_type: "thinking", data: s.thinking });
    if (s.text) push(s, { feed_type: "assistant_text", data: s.text });
  }
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
