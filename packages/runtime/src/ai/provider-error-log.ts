import type { ProviderError } from "@houston/runtime-client";
import { isCodexTerseRefusal } from "./codex-terse-refusal";

const EXPECTED_KINDS: ReadonlySet<ProviderError["kind"]> = new Set([
  "rate_limited",
  "usage_limit_paused",
  "quota_exhausted",
  "model_unavailable",
  "context_overflow",
  "provider_internal",
  "network_unreachable",
]);

const EXPECTED_UNKNOWN_DETAIL = /operation was aborted/i;

const EXPECTED_AUTH_DETAIL = /deactivated_workspace/i;

export interface ProviderErrorLogContext {
  model?: string | null;
  status?: number | null;
  sdkError?: string;
}

export function logProviderError(
  error: ProviderError,
  ctx: ProviderErrorLogContext = {},
): void {
  const verbatim = error.kind === "unknown" ? error.raw_excerpt : error.message;
  const cause = error.kind === "unauthenticated" ? ` cause=${error.cause}` : "";
  const line =
    `[provider_error] provider=${error.provider} model=${ctx.model ?? "?"} ` +
    `status=${ctx.status ?? "?"}${ctx.sdkError ? ` error=${ctx.sdkError}` : ""} ` +
    `kind=${error.kind}${cause} :: ${verbatim}`;
  if (isExpectedProviderState(error)) console.warn(line);
  else console.error(line);
}

export function isExpectedProviderState(error: ProviderError): boolean {
  const verbatim =
    (error.kind === "unknown" ? error.raw_excerpt : error.message) ?? "";
  return (
    EXPECTED_KINDS.has(error.kind) ||
    (error.kind === "unauthenticated" &&
      (error.cause === "no_credentials" ||
        error.cause === "org_policy_blocked")) ||
    (error.kind === "unauthenticated" && EXPECTED_AUTH_DETAIL.test(verbatim)) ||
    (error.kind === "unknown" && EXPECTED_UNKNOWN_DETAIL.test(verbatim)) ||
    (error.kind === "unknown" && isCodexTerseRefusal(error.provider, verbatim))
  );
}

export function logProviderRetry(
  event:
    | {
        type: "auto_retry_start";
        attempt: number;
        maxAttempts: number;
        delayMs: number;
        errorMessage: string;
      }
    | {
        type: "auto_retry_end";
        success: boolean;
        attempt: number;
        finalError?: string;
      },
): void {
  if (event.type === "auto_retry_start") {
    console.warn(
      `[provider_retry] attempt=${event.attempt}/${event.maxAttempts} ` +
        `delay_ms=${event.delayMs} :: ${event.errorMessage}`,
    );
    return;
  }
  if (event.success) {
    console.warn(`[provider_retry] recovered attempt=${event.attempt}`);
    return;
  }
  console.warn(
    `[provider_retry] failed attempt=${event.attempt} :: ${event.finalError ?? "unknown"}`,
  );
}
