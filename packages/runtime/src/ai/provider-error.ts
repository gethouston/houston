import { getOverflowPatterns } from "@earendil-works/pi-ai";
import { toDisplayProviderId } from "@houston/domain/provider-dialect";
import type { AuthFailureCause, ProviderError } from "@houston/runtime-client";
import { servedScopeFor } from "../auth/served-scope";
import { AZURE_OPENAI } from "./azure-openai";
import { isRetriedServerFailure } from "./provider-error-busy";

export interface ProviderErrorInput {
  provider: string;
  model: string | null;
  message: string;
  status?: number | null;
}

const TERMINAL_SESSION_PATTERNS = [
  "app_session_terminated",
  "your session has ended",
  "session has ended",
  "session terminated",
  "session was terminated",
  "log in again",
  "login again",
  "deactivated_workspace",
];

const INVALID_KEY_PATTERNS = [
  "invalid api key",
  "invalid_api_key",
  "incorrect api key",
  "invalid x-api-key",
  "no auth credentials",
  "invalid api-key",
  "authorization failed",
  "permission_denied",
  "project has been denied access",
];

const WRONG_KEY_400_PATTERNS = [
  "incorrect api key",
  "invalid api key",
  "invalid_api_key",
  "invalid api-key",
  "invalid x-api-key",
];

const NO_CREDENTIALS_PATTERNS = [
  "no api key found",
  "no api key for",
  "no provider connected",
  "no local model configured",
  "provider is not configured",
];

const MODEL_UNAVAILABLE_PATTERNS = [
  "model_not_supported",
  "model is not supported",
  "model not supported",
  "is not supported",
  "model_not_found",
  "does not exist or you do not have access",
  "unable to access model",
  "deploymentnotfound",
  "deployment for this resource does not exist",
  "on-demand throughput",
  "provided model identifier is invalid",
  "requested model is not available",
  "regionerror",
  "not found the model",
  "not supported model",
  "accessdenied.unpurchased",
  "unknown model '",
  "no endpoints found for",
  "is not a valid model id",
  "local endpoint serves",
];

const INSUFFICIENT_BALANCE_PATTERNS = [
  "insufficient balance",
  "insufficient_balance",
  "insufficient credits",
  "insufficient funds",
  "not enough credits",
  "creditserror",
  "requires a valid credit card",
  "customer_verification_required",
  "spending limit",
  "payment required",
  "payment_required",
  "credit balance is too low",
  "out of credits",
  "allocationquota",
  "credits expired",
  "dunning decision is deny",
];

const PLAN_LIMIT_PATTERNS = [
  "insufficient_quota",
  "exceeded your current quota",
  "usage limit",
  "usage_limit",
];

const COPILOT_BASE_FALLBACK = "gpt-6-luna";

const CODEX_BROAD_FALLBACK = "gpt-6-luna";

const EXCERPT_MAX = 300;

export function isNvidiaFunctionGated(
  provider: string,
  lowerMessage: string,
  status: number | null,
): boolean {
  if (provider !== "nvidia") return false;
  if (status !== 404 && status !== 410) return false;
  return (
    lowerMessage.includes("(no body)") ||
    lowerMessage.includes("function not found") ||
    lowerMessage.includes("not found for account")
  );
}

const NVIDIA_BROAD_FALLBACK = "minimaxai/minimax-m3.1-flash";

const MOONSHOT_BROAD_FALLBACK = "kimi-k2.6";

const XIAOMI_BROAD_FALLBACK = "mimo-v2.6-pro";

const BEDROCK_BROAD_FALLBACK = "global.anthropic.claude-sonnet-4-6";

const OPENAI_COMPATIBLE_PROVIDER = "openai-compatible";

function isCustomEndpoint404(provider: string, status: number | null): boolean {
  return provider === OPENAI_COMPATIBLE_PROVIDER && status === 404;
}

const LOCAL_ENDPOINT_SERVES = /local endpoint serves "([^"]+)"/i;

function localServedFallback(message: string): string | null {
  return message.match(LOCAL_ENDPOINT_SERVES)?.[1] ?? null;
}

export class ModelNotOfferedError extends Error {
  readonly providerError: ProviderError;

  constructor(provider: string, model: string, fallback: string | null) {
    const message = `${toDisplayProviderId(provider)} model "${model}" is not available`;
    super(message);
    this.name = "ModelNotOfferedError";
    this.providerError = stampCredentialScope({
      kind: "model_unavailable",
      provider,
      model,
      reason: "unknown",
      suggested_fallback: fallback && fallback !== model ? fallback : null,
      message,
    });
  }
}

export function classifyProviderError(
  input: ProviderErrorInput,
): ProviderError {
  return stampCredentialScope(classify(input));
}

export function stampCredentialScope(err: ProviderError): ProviderError {
  const served = servedScopeFor(err.provider);
  if (!served) return err;
  return { ...err, credential: { scope: served } };
}

function classify(input: ProviderErrorInput): ProviderError {
  const { provider } = input;
  const model = input.model ?? null;
  const message = input.message?.trim() || "Unknown provider error";
  const lower = message.toLowerCase();
  const status = input.status ?? extractHttpStatus(message);

  if (model && isNvidiaFunctionGated(provider, lower, status)) {
    return {
      kind: "model_unavailable",
      provider,
      model,
      reason: "unknown",
      suggested_fallback:
        model === NVIDIA_BROAD_FALLBACK ? null : NVIDIA_BROAD_FALLBACK,
      message,
    };
  }
  if (provider === AZURE_OPENAI && lower.includes("base url is required")) {
    return {
      kind: "unauthenticated",
      provider,
      cause: "no_credentials",
      message,
    };
  }
  if (isAuth(lower, status)) {
    return {
      kind: "unauthenticated",
      provider,
      cause: authCause(lower),
      message,
    };
  }
  if (status === 402 || isInsufficientBalance(lower) || isPlanLimit(lower)) {
    return {
      kind: "quota_exhausted",
      provider,
      model,
      scope: "unknown",
      resets_at: null,
      message,
    };
  }
  if (isRateLimited(lower, status)) {
    return {
      kind: "rate_limited",
      provider,
      model,
      retry_after_seconds: extractRetryAfterSeconds(message),
      message,
    };
  }
  if (isContextOverflow(message)) {
    return {
      kind: "context_overflow",
      provider,
      model,
      context_window_tokens: extractContextWindowTokens(message),
      prompt_tokens: extractPromptTokens(message),
      message,
    };
  }
  if (isServerError(lower, status)) {
    return {
      kind: "provider_internal",
      provider,
      http_status: status ?? null,
      message,
    };
  }
  if (isNetwork(lower)) {
    return { kind: "network_unreachable", provider, message };
  }
  if (
    model &&
    (isModelUnavailable(lower) || isCustomEndpoint404(provider, status))
  ) {
    return {
      kind: "model_unavailable",
      provider,
      model,
      reason: modelUnavailableReason(lower),
      suggested_fallback:
        localServedFallback(message) ?? broadFallback(provider, model),
      message,
    };
  }
  return { kind: "unknown", provider, raw_excerpt: excerpt(message) };
}

function broadFallback(provider: string, model: string): string | null {
  const fallback =
    provider === "github-copilot"
      ? COPILOT_BASE_FALLBACK
      : provider === "openai-codex"
        ? CODEX_BROAD_FALLBACK
        : provider === "moonshotai"
          ? MOONSHOT_BROAD_FALLBACK
          : provider === "xiaomi"
            ? XIAOMI_BROAD_FALLBACK
            : provider === "amazon-bedrock"
              ? BEDROCK_BROAD_FALLBACK
              : null;
  return fallback && fallback !== model ? fallback : null;
}

function isAuth(lower: string, status: number | null): boolean {
  if (typeof status === "number" && status !== 401 && status !== 403)
    return (
      status === 400 && WRONG_KEY_400_PATTERNS.some((p) => lower.includes(p))
    );
  if (isInsufficientBalance(lower) || isModelUnavailable(lower)) return false;
  if (status === 401) return true;
  return (
    lower.includes("unauthorized") ||
    lower.includes("unauthenticated") ||
    lower.includes("authentication") ||
    lower.includes("not logged in") ||
    lower.includes("oauth token") ||
    INVALID_KEY_PATTERNS.some((p) => lower.includes(p)) ||
    NO_CREDENTIALS_PATTERNS.some((p) => lower.includes(p)) ||
    TERMINAL_SESSION_PATTERNS.some((p) => lower.includes(p))
  );
}

function authCause(lower: string): AuthFailureCause {
  if (NO_CREDENTIALS_PATTERNS.some((p) => lower.includes(p)))
    return "no_credentials";
  if (INVALID_KEY_PATTERNS.some((p) => lower.includes(p)))
    return "invalid_api_key";
  if (
    lower.includes("revoked") ||
    TERMINAL_SESSION_PATTERNS.some((p) => lower.includes(p))
  )
    return "token_revoked";
  if (lower.includes("expired")) return "token_expired";
  return "unknown";
}

function isRateLimited(lower: string, status: number | null): boolean {
  if (status === 429) return true;
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("ratelimit") ||
    lower.includes("too many requests") ||
    lower.includes("throttl") ||
    lower.includes("quota") ||
    lower.includes("resourceexhausted") ||
    lower.includes("resource_exhausted") ||
    lower.includes("request limit reached")
  );
}

function isServerError(lower: string, status: number | null): boolean {
  if (typeof status === "number" && status >= 500 && status <= 599) return true;
  return (
    lower.includes("internal server error") ||
    lower.includes("service unavailable") ||
    lower.includes("bad gateway") ||
    lower.includes("gateway timeout") ||
    lower.includes("overloaded") ||
    lower.includes("streaming response failed") ||
    lower.includes("finish_reason: error") ||
    lower.includes("finish_reason: network_error") ||
    lower.includes("stream ended without finish_reason") ||
    lower.includes("got status: unavailable") ||
    lower.includes("experiencing high demand") ||
    isRetriedServerFailure(lower, status) ||
    lower.includes("malformed_function_call") ||
    lower.includes("malformed_response") ||
    lower.includes("unknown role:") ||
    lower.includes("websocket closed") ||
    lower.includes("upstream connect error") ||
    lower.includes("upstream idle timeout") ||
    lower.includes("error occurred while processing your request") ||
    lower === "terminated" ||
    lower.endsWith(": terminated")
  );
}

function isNetwork(lower: string): boolean {
  return (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("eai_again") ||
    lower.includes("socket hang up") ||
    lower.includes("network error") ||
    lower.includes("connection refused") ||
    lower.includes("connection reset")
  );
}

function isModelUnavailable(lower: string): boolean {
  return (
    MODEL_UNAVAILABLE_PATTERNS.some((p) => lower.includes(p)) ||
    isVertexPublisherModelMissing(lower)
  );
}

function isVertexPublisherModelMissing(lower: string): boolean {
  return lower.includes("publisher model") && lower.includes("not found");
}

function modelUnavailableReason(
  lower: string,
): "not_deployed" | "region_restricted" | "unknown" {
  if (
    lower.includes("deploymentnotfound") ||
    lower.includes("deployment for this resource does not exist")
  )
    return "not_deployed";
  return lower.includes("regionerror") || lower.includes("hosted in china")
    ? "region_restricted"
    : "unknown";
}

const EXTRA_OVERFLOW_PATTERNS = [/string too long/i];

function isContextOverflow(message: string): boolean {
  return [...getOverflowPatterns(), ...EXTRA_OVERFLOW_PATTERNS].some((p) =>
    p.test(message),
  );
}

export function extractContextWindowTokens(message: string): number | null {
  const m =
    message.match(/"n_ctx"\s*:\s*(\d+)/) ??
    message.match(/context size \((\d+)\s*tokens?\)/i) ??
    message.match(/maximum context length is (\d+)/i) ??
    message.match(/>\s*(\d+)\s*maximum/i);
  return m ? positiveInt(m[1]) : null;
}

export function extractPromptTokens(message: string): number | null {
  const m =
    message.match(/"n_prompt_tokens"\s*:\s*(\d+)/) ??
    message.match(/request \((\d+)\s*tokens?\)/i) ??
    message.match(/too long:?\s*(\d+)\s*tokens?/i);
  return m ? positiveInt(m[1]) : null;
}

function positiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isInsufficientBalance(lower: string): boolean {
  return INSUFFICIENT_BALANCE_PATTERNS.some((p) => lower.includes(p));
}

function isPlanLimit(lower: string): boolean {
  return PLAN_LIMIT_PATTERNS.some((p) => lower.includes(p));
}

export function extractHttpStatus(message: string): number | null {
  const paren = message.match(/\((\d{3})\)/);
  if (paren) {
    const n = Number(paren[1]);
    if (n >= 100 && n <= 599) return n;
  }
  const lead = message.match(/^\s*(\d{3})\b/);
  if (lead) {
    const n = Number(lead[1]);
    if (n >= 100 && n <= 599) return n;
  }
  const statusCode = message.match(/\b([1-5]\d{2}) status code\b/);
  if (statusCode) return Number(statusCode[1]);
  const labelled = message.match(
    /(?:status|http|api error)[^\d]{0,4}(\d{3})\b/i,
  );
  if (labelled) {
    const n = Number(labelled[1]);
    if (n >= 100 && n <= 599) return n;
  }
  const embedded = message.match(/"code"\s*:\s*"?([45]\d{2})\b/);
  if (embedded) return Number(embedded[1]);
  return null;
}

const RETRY_LEAD = "(?:try again|retry|resets?|available|wait)";

export function extractRetryAfterSeconds(message: string): number | null {
  const header = message.match(/retry[\s-]?after[:\s]+(\d+(?:\.\d+)?)/i);
  if (header) return clampSeconds(Math.ceil(Number(header[1])));
  const ms = message.match(
    new RegExp(`${RETRY_LEAD}\\D{0,16}?(\\d+(?:\\.\\d+)?)\\s*ms\\b`, "i"),
  );
  if (ms) return clampSeconds(Math.ceil(Number(ms[1]) / 1000));
  const mins = message.match(
    new RegExp(
      `${RETRY_LEAD}\\D{0,16}?(\\d+(?:\\.\\d+)?)\\s*m(?:in(?:ute)?s?)?\\b`,
      "i",
    ),
  );
  if (mins) return clampSeconds(Math.round(Number(mins[1]) * 60));
  const secs = message.match(
    new RegExp(
      `${RETRY_LEAD}\\D{0,16}?(\\d+(?:\\.\\d+)?)\\s*s(?:ec(?:ond)?s?)?\\b`,
      "i",
    ),
  );
  if (secs) return clampSeconds(Math.ceil(Number(secs[1])));
  return null;
}

function clampSeconds(n: number): number | null {
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), 86_400);
}

function excerpt(message: string): string {
  return message.length > EXCERPT_MAX
    ? `${message.slice(0, EXCERPT_MAX)}…`
    : message;
}
