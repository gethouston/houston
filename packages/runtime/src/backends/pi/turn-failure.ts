import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ProviderError } from "@houston/runtime-client";
import {
  noteCodexRefusal,
  resolveCodexTerseRefusal,
} from "../../ai/codex-terse-refusal";
import { classifyProviderError } from "../../ai/provider-error";
import { logProviderError } from "../../ai/provider-error-log";
import { canonicalPinProvider } from "../../ai/providers";
import {
  noteAuthFailure,
  noteQuotaExhausted,
} from "../../auth/credential-health";
import { reportRevokedServedToken } from "../../auth/report-revoked";
import { currentUsedTokenDigest } from "../../auth/used-token";

export interface TurnHints {
  retryErrorMessage?: string | null;
}

export function classifyTurnFailure(
  msg: AssistantMessage,
  errorMessage: string,
  hints: TurnHints = {},
): ProviderError {
  const status = diagnosticStatus(msg.diagnostics);
  const input = {
    provider: msg.provider,
    model: msg.model ?? null,
    message: errorMessage,
    status,
  };
  const plain = classifyProviderError(input);
  const classified =
    plain.kind === "unknown"
      ? (resolveCodexTerseRefusal({
          ...input,
          retryErrorMessage: hints.retryErrorMessage,
        }) ?? plain)
      : plain;
  noteCodexRefusal(classified);
  logProviderError(classified, { model: msg.model ?? null, status });
  if (classified.kind === "unauthenticated") {
    noteAuthFailure(canonicalPinProvider(classified.provider));
    reportRevokedServedToken(
      classified,
      currentUsedTokenDigest(classified.provider),
    );
  }
  if (classified.kind === "quota_exhausted") {
    noteQuotaExhausted(
      canonicalPinProvider(classified.provider),
      classified.resets_at,
    );
  }
  return classified;
}

function diagnosticStatus(
  diagnostics: AssistantMessage["diagnostics"],
): number | null {
  if (!diagnostics) return null;
  for (const d of diagnostics) {
    const code = d.error?.code;
    if (typeof code === "number" && code >= 100 && code <= 599) return code;
    if (typeof code === "string") {
      const n = Number(code);
      if (Number.isFinite(n) && n >= 100 && n <= 599) return n;
    }
    const status = d.details?.status ?? d.details?.httpStatus;
    if (typeof status === "number" && status >= 100 && status <= 599) {
      return status;
    }
  }
  return null;
}
