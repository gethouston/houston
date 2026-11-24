import { EngineError, FatalResumeError } from "@houston/runtime-client";
import {
  type MessageLimitRefusal,
  parseMessageLimitRefusal,
} from "@houston/wire-types";
import { isWakingAnswer } from "../waking-answer";

/**
 * The C19 `message_limit` refusal behind any failed call, or null. Every
 * transport carries the 429 differently: the runtime client's `EngineError`
 * keeps the body as text, the SDK REST families keep it as the message, and
 * the adapter's `HoustonEngineError` holds it parsed. A turn start, a routine
 * Run now and a mission start all read it through here.
 */
export function messageLimitRefusal(
  error: unknown,
): MessageLimitRefusal | null {
  const cause = error instanceof FatalResumeError ? error.cause : error;
  if (!(cause instanceof Error)) return null;
  const { status, body } = cause as { status?: unknown; body?: unknown };
  if (status !== 429) return null;
  if (typeof body === "string") return parseText(body);
  return body === undefined
    ? parseText(cause.message)
    : parseMessageLimitRefusal(body);
}

function parseText(text: string): MessageLimitRefusal | null {
  try {
    return parseMessageLimitRefusal(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Product-voice fallback for a turn failure that carries no engine-authored
 * copy. Deliberately generic: the raw cause (a WebKit "Load failed", a thrown
 * bug, …) is developer speak that must never reach the chat — it goes to the
 * console/log instead.
 */
export const TURN_FAILED_MESSAGE = "Something went wrong. Please try again.";

/**
 * A turn that fails on the SEND (e.g. no provider connected → the runtime answers
 * 409) rejects with an EngineError wrapping the runtime's JSON body. Unwrap it to
 * the plain message the engine sent, so the chat shows "No provider connected. Log
 * in with Claude or Codex first." rather than a raw `engine request failed (409):
 * {…}` string (the product voice never shows status codes or JSON to the user).
 * A fatal stream refusal (FatalResumeError) unwraps to the EngineError it carries.
 * Anything WITHOUT engine-authored copy — a transport failure, a thrown bug —
 * resolves to {@link TURN_FAILED_MESSAGE}; the raw error is logged so the
 * detail still lands in the frontend log for diagnosis.
 */
export function turnErrorMessage(e: unknown): string {
  const verdict = engineVerdictMessage(e);
  if (verdict !== undefined) return verdict;
  if (e instanceof FatalResumeError) e = e.cause;
  console.error("[turn] failed without engine verdict:", e);
  return TURN_FAILED_MESSAGE;
}

export function engineVerdictMessage(e: unknown): string | undefined {
  if (e instanceof FatalResumeError) e = e.cause;
  if (!(e instanceof EngineError)) return undefined;
  try {
    const body = JSON.parse(e.body) as { error?: string };
    if (body?.error) return body.error;
  } catch {}
  return undefined;
}

/**
 * The engine answered the send with "not here, not now": the agent's pod is
 * waking, restarting (a release roll, a drain), its runtime is still booting,
 * or its id is latched for the seconds a rename moves its directory,
 * and the SAME send succeeds once it is back. Keyed on the exact
 * (status, reason) pairs the gateway and host mint for that state, never on a
 * bare 502/503 (a provider quota page on the same status is a real failure).
 * The web adapter's `isEngineWakingError` reads the same pairs across every
 * client error shape; this is the one shape the turn stream sees.
 */
export function isEngineWakingRejection(e: unknown): boolean {
  if (!(e instanceof EngineError)) return false;
  const reason = engineVerdictMessage(e);
  return reason !== undefined && isWakingAnswer(e.status, reason);
}

export function isAmbiguousSendFailure(e: unknown): boolean {
  if (e instanceof EngineError) return false;
  if (e instanceof Error && e.name === "AbortError") return false;
  return true;
}

/**
 * Whether a turn failure is the runtime's "no provider connected" refusal — the
 * verbatim message it raises when the chat's provider is logged out (runtime
 * `ai/providers.ts`, `transport/server.ts`, `turn/server.ts`; all prefixed
 * "No provider connected."). This is a HANDLED, recoverable state surfaced by
 * the in-chat reconnect card, not a turn failure, so the UI settles it cleanly
 * rather than rendering it as an error.
 */
export function isNotConnectedError(message: string): boolean {
  return message.toLowerCase().includes("no provider connected");
}

export const STOPPED_BY_USER = "Stopped by user";

/**
 * A turn that died without persisting a reply: the same copy the host's
 * dead-pump reaper stamps on the terminal `error` frame it synthesizes
 * (`packages/host/src/turn/relay-dialect.ts` TURN_DIED_MESSAGE), so the
 * surface reads identically whether the server or this client detected it.
 */
export const TURN_DIED_MESSAGE = "The turn ended unexpectedly";

/**
 * The line for a turn the ENGINE died on (a pod OOM-killed mid-turn, the
 * desktop force-quit): the runtime's boot settle stamps the dead turn's reply
 * `interrupted` (`ChatMessage.interrupted`), and both the lost-terminal settle
 * and the history replay render this from it. Product voice: the user's next
 * move is in the copy, and nothing technical (no "process", "pod", "memory").
 */
export const ENGINE_RESTART_MESSAGE =
  "Your agent had to restart. Say continue and it will pick up where it left off.";

/**
 * The line for a turn the engine died on and is ALREADY running again by
 * itself (`interrupted.resumed`). Same shape as
 * {@link ENGINE_RESTART_MESSAGE} and the same product voice, minus the ask:
 * there is nothing for the user to do, so the copy only accounts for the pause
 * they saw. A turn that renders this must not settle as an error — the work is
 * still going (see `finishResumed`).
 */
export const ENGINE_RESUMED_MESSAGE =
  "Your agent was interrupted by a restart and is picking up where it left off.";

/**
 * Why a system line was authored, carried beside its English default.
 * Surfaces localize by kind; the English text is only a default.
 * Busy notices describe a send that exhausted its waiting budget.
 * `agent_too_large` / `agent_setup_failed`: a turn that failed before any
 * provider work; `turn_unconfirmed`: an accepted turn we never saw again
 * (`turn-notices.ts`). `turn_time_limit`: saved work at the reply ceiling.
 */
export type EngineNoticeKind =
  | "engine_restart"
  | "engine_resumed"
  | "sandbox_lost"
  | "turn_time_limit"
  | "turn_time_limit_unsaved"
  | "send_busy"
  | "compute_busy"
  | "agent_too_large"
  | "agent_setup_failed"
  | "turn_unconfirmed"
  | "files_not_saved";

/**
 * Whether a turn's terminal error is the user pressing Stop — the verbatim
 * message the runtime (and the control plane's relay) emit on a cancel. This is
 * an intentional, handled stop, not a turn failure, so the UI shows the message
 * but settles the card back to the user (needs_you), never the red error state.
 */
export function isStoppedByUser(message: string): boolean {
  return message.includes(STOPPED_BY_USER);
}
