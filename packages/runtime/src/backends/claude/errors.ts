import type { SDKAssistantMessageError } from "@anthropic-ai/claude-agent-sdk";
import type { AuthFailureCause, ProviderError } from "@houston/runtime-client";
import {
  classifyProviderError,
  extractRetryAfterSeconds,
} from "../../ai/provider-error";
import { logProviderError } from "../../ai/provider-error-log";
import { noteAuthFailure } from "../../auth/credential-health";

/** The pi provider id this backend runs as — every error is attributed to it. */
const PROVIDER = "anthropic";

/** Context the SDK gives us alongside a typed error enum. */
export interface SdkErrorContext {
  /** Verbatim provider failure text (from the message / result), for the card + logs. */
  message: string;
  /** The model the turn ran on, or null when unknown. */
  model: string | null;
  /** HTTP status the SDK surfaced (`result.api_error_status`), when present. */
  status?: number | null;
  /** Seconds until a rate limit resets, from a `rate_limit_event` when one arrived. */
  retryAfterSeconds?: number | null;
}

/**
 * Map a typed Claude Agent SDK error enum to Houston's `ProviderError` union so
 * the chat renders the matching inline card. Deterministic on the enum: the SDK
 * already classified the failure, so `rate_limit` is always a rate-limit card
 * regardless of the message text (unlike the pi path, which parses a flat string).
 *
 * The verbatim provider text is logged AFTER it is reduced to a typed card
 * (parity with `pi/wire.ts`), through the severity-aware `logProviderError` —
 * the raw reason is otherwise lost once collapsed, and each failure logs
 * exactly once (the fall-through to `classifyText` used to double-log).
 *
 * `invalid_request` / `max_output_tokens` / `unknown` have no clean card of their
 * own, so they fall through to the shared text classifier with the status the SDK
 * gave us — the same path a raw thrown error takes.
 */
export function mapSdkError(
  error: SDKAssistantMessageError,
  ctx: SdkErrorContext,
): ProviderError {
  const message = ctx.message.trim() || "Unknown provider error";
  const model = ctx.model;
  const status = ctx.status ?? null;
  const mapped = mapSdkEnum(error, message, model, status, ctx);
  // Fall-through cases delegate to classifyText, which logs for itself.
  if (mapped) {
    logProviderError(mapped, { model, status, sdkError: error });
    // Feed the failure into the status surface: the credential the turn just
    // ran on cannot authenticate, so "Connected" would be a lie until it
    // changes (auth/credential-health.ts).
    if (mapped.kind === "unauthenticated") noteAuthFailure(mapped.provider);
  }
  return mapped ?? classifyText(message, model, status);
}

/** The enum-determined mappings; null falls through to the text classifier. */
function mapSdkEnum(
  error: SDKAssistantMessageError,
  message: string,
  model: string | null,
  status: number | null,
  ctx: SdkErrorContext,
): ProviderError | null {
  switch (error) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
      return {
        kind: "unauthenticated",
        provider: PROVIDER,
        cause: authCause(message.toLowerCase()),
        message,
      };
    case "billing_error":
      return {
        kind: "quota_exhausted",
        provider: PROVIDER,
        model,
        scope: "unknown",
        resets_at: null,
        message,
      };
    case "rate_limit":
      return {
        kind: "rate_limited",
        provider: PROVIDER,
        model,
        retry_after_seconds:
          ctx.retryAfterSeconds ?? extractRetryAfterSeconds(message),
        message,
      };
    case "overloaded":
    case "server_error":
      return {
        kind: "provider_internal",
        provider: PROVIDER,
        http_status: status,
        message,
      };
    case "model_not_found":
      // `model_unavailable` needs a concrete model to name; without one it can't
      // render the "switch model" card, so fall through to the text classifier.
      if (model)
        return {
          kind: "model_unavailable",
          provider: PROVIDER,
          model,
          reason: "unknown",
          suggested_fallback: null,
          message,
        };
      return null;
    default:
      return null;
  }
}

/** Classify raw/untyped failure text (thrown errors, result-error subtypes). */
export function classifyText(
  message: string,
  model: string | null,
  status: number | null,
): ProviderError {
  const classified = classifyProviderError({
    provider: PROVIDER,
    model,
    message,
    status,
  });
  logProviderError(classified, { model, status });
  if (classified.kind === "unauthenticated")
    noteAuthFailure(classified.provider);
  return classified;
}

/**
 * A minimal auth-cause read off an authentication failure's text. The full
 * pattern set lives (unexported) in `ai/provider-error.ts`; here the SDK has
 * already decided it is auth, so only the recover-vs-reconnect distinction is
 * needed to pick the card's body copy.
 */
function authCause(lower: string): AuthFailureCause {
  if (
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("incorrect api key")
  )
    return "invalid_api_key";
  if (
    lower.includes("revoked") ||
    lower.includes("session has ended") ||
    lower.includes("session terminated") ||
    lower.includes("log in again")
  )
    return "token_revoked";
  if (lower.includes("expired")) return "token_expired";
  return "unknown";
}
