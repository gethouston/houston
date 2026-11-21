import type { ProviderError } from "@houston/runtime-client";
import { extractRetryAfterSeconds } from "../../ai/provider-error";
import { resetFromText } from "./usage-limit-reset";

const PROVIDER = "anthropic";
const SYNTHETIC_MODEL = "<synthetic>";

export const USAGE_LIMIT_MIN_RETRY_SECONDS = 60 * 60;

export interface ClaudeRateLimitInfo {
  status?: string;
  isUsingOverage?: boolean;
  overageStatus?: string;
  resetsAt?: number | null;
}

export interface ClaudeRateLimitContext {
  rateLimit?: ClaudeRateLimitInfo | null;
  retryAfterSeconds?: number | null;
}

const LIMIT_SENTENCE =
  /[Yy]ou(?:['’]ve| have) (?:hit|reached) your (?:(?:session|weekly|usage) limit|[A-Z][a-z]+(?: \d[\d.]*)? limit)\b/;
const LIMIT_EPOCH = /\busage limit reached\b/i;

export function classifyClaudeRateLimit(
  message: string,
  model: string | null,
  ctx: ClaudeRateLimitContext,
  nowMs: number = Date.now(),
): ProviderError {
  const rejected = isRejectedWindow(ctx.rateLimit);
  const eventReset = rejected ? resetFromEvent(ctx.rateLimit) : null;
  const fromText = usageLimitFromText(message, model, nowMs);
  if (fromText)
    return { ...fromText, resets_at: eventReset ?? fromText.resets_at };
  const retry = ctx.retryAfterSeconds ?? extractRetryAfterSeconds(message);
  if (rejected && (retry === null || retry > USAGE_LIMIT_MIN_RETRY_SECONDS))
    return limit(message, model, eventReset ?? resetFromText(message, nowMs));
  if (retry !== null && retry > USAGE_LIMIT_MIN_RETRY_SECONDS) {
    return limit(message, model, new Date(nowMs + retry * 1000).toISOString());
  }
  return {
    kind: "rate_limited",
    provider: PROVIDER,
    model,
    retry_after_seconds: retry,
    message,
  };
}

export function usageLimitFromText(
  message: string,
  model: string | null,
  nowMs: number = Date.now(),
): Extract<ProviderError, { kind: "usage_limit_paused" }> | null {
  if (!LIMIT_SENTENCE.test(message) && !LIMIT_EPOCH.test(message)) return null;
  return limit(message, model, resetFromText(message, nowMs));
}

function limit(
  message: string,
  model: string | null,
  resetsAt: string | null,
): Extract<ProviderError, { kind: "usage_limit_paused" }> {
  return {
    kind: "usage_limit_paused",
    provider: PROVIDER,
    model: model === SYNTHETIC_MODEL ? null : model,
    resets_at: resetsAt,
    message,
  };
}

function resetFromEvent(info: ClaudeRateLimitInfo | null | undefined) {
  const at = info?.resetsAt;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  return new Date(at < 1e12 ? at * 1000 : at).toISOString();
}

export function isRejectedWindow(
  info: ClaudeRateLimitInfo | null | undefined,
): boolean {
  if (info?.status !== "rejected") return false;
  return info.isUsingOverage !== true && info.overageStatus !== "allowed";
}
