import type { SDKAssistantMessageError } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderError } from "@houston/runtime-client";
import {
  classifyProviderError,
  stampCredentialScope,
} from "../../ai/provider-error";
import { logProviderError } from "../../ai/provider-error-log";
import {
  noteAuthFailure,
  noteQuotaExhausted,
} from "../../auth/credential-health";
import { reportRevokedServedToken } from "../../auth/report-revoked";
import { authCause } from "./auth-cause";
import {
  type ClaudeRateLimitContext,
  classifyClaudeRateLimit,
  usageLimitFromText,
} from "./usage-limit";

const PROVIDER = "anthropic";

export interface SdkErrorContext extends ClaudeRateLimitContext {
  message: string;
  model: string | null;
  status?: number | null;
  usedAccessDigest?: string;
}

export function mapSdkError(
  error: SDKAssistantMessageError,
  ctx: SdkErrorContext,
): ProviderError {
  const message = ctx.message.trim() || "Unknown provider error";
  const model = ctx.model;
  const status = ctx.status ?? null;
  const enumMapped = mapSdkEnum(error, message, model, status, ctx);
  const mapped = enumMapped ? stampCredentialScope(enumMapped) : null;
  if (mapped) {
    logProviderError(mapped, { model, status, sdkError: error });
    if (mapped.kind === "unauthenticated") {
      noteAuthFailure(mapped.provider);
      reportRevokedServedToken(mapped, ctx.usedAccessDigest);
    }
    if (mapped.kind === "quota_exhausted")
      noteQuotaExhausted(mapped.provider, mapped.resets_at);
  }
  return mapped ?? classifyText(message, model, status, ctx.usedAccessDigest);
}

function mapSdkEnum(
  error: SDKAssistantMessageError,
  message: string,
  model: string | null,
  status: number | null,
  ctx: SdkErrorContext,
): ProviderError | null {
  switch (error) {
    case "authentication_failed":
      return {
        kind: "unauthenticated",
        provider: PROVIDER,
        cause: authCause(message.toLowerCase()),
        message,
      };
    case "oauth_org_not_allowed":
      return {
        kind: "unauthenticated",
        provider: PROVIDER,
        cause: "org_policy_blocked",
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
      return classifyClaudeRateLimit(message, model, ctx);
    case "overloaded":
    case "server_error":
      return {
        kind: "provider_internal",
        provider: PROVIDER,
        http_status: status,
        message,
      };
    case "model_not_found":
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

export function classifyText(
  message: string,
  model: string | null,
  status: number | null,
  usedAccessDigest?: string,
): ProviderError {
  const limit = usageLimitFromText(message, model);
  const classified = limit
    ? stampCredentialScope(limit)
    : classifyProviderError({
        provider: PROVIDER,
        model,
        message,
        status,
      });
  logProviderError(classified, { model, status });
  if (classified.kind === "unauthenticated") {
    noteAuthFailure(classified.provider);
    reportRevokedServedToken(classified, usedAccessDigest);
  }
  if (classified.kind === "quota_exhausted")
    noteQuotaExhausted(classified.provider, classified.resets_at);
  return classified;
}
