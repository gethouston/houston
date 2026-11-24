import { EngineError, FatalResumeError } from "@houston/runtime-client";
import {
  type MessageLimitRefusal,
  parseMessageLimitRefusal,
} from "@houston/wire-types";
import { isWakingAnswer } from "../waking-answer";

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

export const TURN_FAILED_MESSAGE = "Something went wrong. Please try again.";

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

export function isNotConnectedError(message: string): boolean {
  return message.toLowerCase().includes("no provider connected");
}

export const STOPPED_BY_USER = "Stopped by user";

export const TURN_DIED_MESSAGE = "The turn ended unexpectedly";

export const ENGINE_RESTART_MESSAGE =
  "Your agent had to restart. Say continue and it will pick up where it left off.";

export const ENGINE_RESUMED_MESSAGE =
  "Your agent was interrupted by a restart and is picking up where it left off.";

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
  | "turn_unconfirmed";

export function isStoppedByUser(message: string): boolean {
  return message.includes(STOPPED_BY_USER);
}
