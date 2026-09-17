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

/** Per-prompt context the stateful translator hands the pure mapping. */
export interface TurnHints {
  /** The failure text of pi's last auto-retry attempt in this prompt, if any. */
  retryErrorMessage?: string | null;
}

/**
 * Turn a failed pi turn into the typed provider error the chat renders, and
 * feed every surface that must learn from it: the engine log (the verbatim
 * provider text, once, at a severity that follows the kind), the credential
 * status (an auth failure or an exhausted quota), the revoked-token report,
 * and the Codex refusal memory. Split out of the wire mapping (wire.ts) so
 * the mapping stays a switch over pi's event union.
 */
export function classifyTurnFailure(
  msg: AssistantMessage,
  errorMessage: string,
  hints: TurnHints = {},
): ProviderError {
  // Log the provider's VERBATIM failure text once it's reduced to a typed
  // card (severity follows the classified kind — an expected 429/503 is a
  // warning breadcrumb, not a Sentry error). The classifier collapses it
  // into "unauthenticated" / "rate_limited" / etc., but the raw reason (an
  // opencode.ai 401 body, an entitlement 403, a misclassified non-auth
  // error) is otherwise never recorded — leaving production provider
  // failures undiagnosable from the engine logs.
  const status = diagnosticStatus(msg.diagnostics);
  const input = {
    provider: msg.provider,
    model: msg.model ?? null,
    message: errorMessage,
    status,
  };
  const plain = classifyProviderError(input);
  // A reason-less ChatGPT refusal (`{"detail":"Bad Request"}`, a bare
  // `Not Found`) borrows the reading of the explained refusal the same
  // account got moments earlier (PRODUCT-1832); an explained one is
  // remembered for exactly that.
  const classified =
    plain.kind === "unknown"
      ? (resolveCodexTerseRefusal({
          ...input,
          retryErrorMessage: hints.retryErrorMessage,
        }) ?? plain)
      : plain;
  noteCodexRefusal(classified);
  logProviderError(classified, { model: msg.model ?? null, status });
  // Feed an auth failure into the status surface: the credential the
  // turn just ran on cannot authenticate, so "Connected" would be a lie
  // until it changes (auth/credential-health.ts).
  if (classified.kind === "unauthenticated") {
    noteAuthFailure(canonicalPinProvider(classified.provider));
    // A REVOKED served token is invisible to the control plane (HOU-952).
    // Named by the digest of the token the failed request actually ran
    // on — recorded at pi's request-time credential read, inside this
    // same turn subtree (auth/used-token.ts, PRODUCT-1319). Keyed by
    // `classified.provider` (= pi's `msg.provider`), the same id pi read
    // the credential under.
    reportRevokedServedToken(
      classified,
      currentUsedTokenDigest(classified.provider),
    );
  }
  // The same status-surface feed for an exhausted account: the
  // credential authenticates fine, so this is "out of credits", never a
  // reconnect (auth/credential-health.ts).
  if (classified.kind === "quota_exhausted") {
    noteQuotaExhausted(
      canonicalPinProvider(classified.provider),
      classified.resets_at,
    );
  }
  return classified;
}

/**
 * Read an HTTP status off pi's structured diagnostics when it attached one
 * (`error.code` or `details.status`). pi often only sets a string `errorMessage`
 * with no diagnostic, so this is a best-effort hint; the classifier still parses
 * the message text when this returns null.
 */
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
