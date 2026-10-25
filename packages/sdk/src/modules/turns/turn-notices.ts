import { parseTurnSetupFailure, TurnErrorCode } from "@houston/wire-types";
import type { EngineNoticeKind } from "./turn-errors";
import { finishErr, type TurnState } from "./turn-settle";

/**
 * A pooled turn that failed before any provider work (`TurnSetupFailure`,
 * H-003) settles with a typed notice instead of the worker's bare code, which
 * is developer speak. A surface renders its own copy by kind; these English
 * lines are the defaults for surfaces without a dictionary.
 */
export type TurnSetupNotice = Extract<
  EngineNoticeKind,
  "agent_too_large" | "agent_setup_failed"
>;

/** `hydrate_over_cap`: the agent holds more than a worker can open. A retry
 *  cannot help, and the report already reached us. */
export const AGENT_TOO_LARGE_MESSAGE =
  "This agent has too much saved to start right now, so this message wasn't sent. We've been notified and are working on it.";

/**
 * Every other setup failure: nothing ran and nothing was saved, so sending
 * again cannot repeat work.
 */
export const AGENT_SETUP_FAILED_MESSAGE =
  "Your agent couldn't get ready for this message. Send it again in a moment.";

/**
 * An accepted turn whose conversation never appeared long after its 202
 * (`PRESETTLED_GONE_MS`) and whose end never reached us. We do not know it
 * failed, so the line never says to resend right away.
 */
export const TURN_UNCONFIRMED_MESSAGE =
  "We couldn't confirm your agent got this message. Check back in a few minutes, and if there's still no reply, send it again.";

/** Saved work at the gateway's reply ceiling, an expected end. */
export const TURN_TIME_LIMIT_MESSAGE =
  'Your agent worked for 4 hours, the limit for one reply. Its progress is saved. Say "continue" and it will pick up where it left off.';

/** The forced fallback cannot promise that the last steps were saved. */
export const TURN_TIME_LIMIT_UNSAVED_MESSAGE =
  'Your agent reached the 4-hour limit for one reply and stopped before it could save its last steps. Say "continue" to pick up from the last saved point.';

export function timeLimitNotice(
  code: unknown,
): { kind: TurnErrorCode; message: string } | undefined {
  if (code === TurnErrorCode.TimeLimit)
    return { kind: code, message: TURN_TIME_LIMIT_MESSAGE };
  if (code === TurnErrorCode.TimeLimitUnsaved)
    return { kind: code, message: TURN_TIME_LIMIT_UNSAVED_MESSAGE };
  return undefined;
}

const MESSAGES: Record<TurnSetupNotice, string> = {
  agent_too_large: AGENT_TOO_LARGE_MESSAGE,
  agent_setup_failed: AGENT_SETUP_FAILED_MESSAGE,
};

/**
 * Settle an `error` frame that is a setup failure; false when it is not one.
 * Nothing was saved, so the optimistic bubble fails like an undelivered send
 * (the 202 only proved the worker answered). The code rides as the item's
 * `cause` for reports; the worker's detail reaches the frontend log.
 */
export function finishSetupError(s: TurnState, data: unknown): boolean {
  const failure = parseTurnSetupFailure(data);
  if (!failure) return false;
  console.warn("[turn] setup failed:", failure.code, failure.detail ?? "");
  const notice: TurnSetupNotice =
    failure.code === "hydrate_over_cap"
      ? "agent_too_large"
      : "agent_setup_failed";
  s.delivered = false;
  finishErr(s, MESSAGES[notice], notice, failure.code);
  return true;
}

/**
 * The pre-settled poll's bound: the accepted turn's conversation never
 * appeared. Not proof that nothing was saved, so the bubble keeps its state.
 */
export function finishGone(s: TurnState): void {
  finishErr(s, TURN_UNCONFIRMED_MESSAGE, "turn_unconfirmed", "gone");
}

/** Which notices are ours to report, and under which source. */
const REPORTED: Partial<Record<EngineNoticeKind, string>> = {
  agent_too_large: "turn_setup_failed",
  agent_setup_failed: "turn_setup_failed",
  turn_unconfirmed: "turn_gone_after_accept",
};

/**
 * The report a pushed feed item calls for, or null. A setup failure and a
 * lost terminal are unexpected: the chat line is the person's whole surface
 * (no toast), and this report is ours. The message names only the cause, so
 * reports group by it; the turn and conversation ride as error fields.
 */
export function turnFailureReport(
  item: unknown,
  sessionKey?: string,
): { source: string; error: Error } | null {
  const it = item as {
    feed_type?: unknown;
    notice?: EngineNoticeKind;
    cause?: unknown;
    turnId?: unknown;
  };
  if (it.feed_type !== "system_message" || it.notice === undefined) return null;
  const source = REPORTED[it.notice];
  if (!source) return null;
  const cause = typeof it.cause === "string" ? it.cause : it.notice;
  const error = new Error(
    source === "turn_gone_after_accept"
      ? "turn conversation still not found after its 202"
      : `turn setup failed: ${cause}`,
  );
  return {
    source,
    error: Object.assign(error, {
      ...(typeof it.turnId === "string" ? { turnId: it.turnId } : {}),
      ...(sessionKey ? { sessionKey } : {}),
    }),
  };
}
