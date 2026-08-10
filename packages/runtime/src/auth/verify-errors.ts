/**
 * Shared vocabulary of key-verification failures (`verify-api-key.ts` is the
 * entry point; `nvidia-verify.ts` throws these too).
 */

export const VERIFY_TIMEOUT_MS = 20_000;

/**
 * `ProviderError` kinds that prove the credential was ACCEPTED by the
 * provider: a garbage key can't be rate-limited, out of credit, gated off a
 * model, or over a context window. Shared by the main verify flow and the
 * qwen region prober (`qwen-verify.ts`).
 */
export const PROVES_AUTH: ReadonlySet<string> = new Set([
  "rate_limited",
  "quota_exhausted",
  "model_unavailable",
  "context_overflow",
]);

/**
 * Human-readable text for an exception the verify request RAISED (vs a resolved
 * errored reply). An abort/timeout DOMException reads like a bug ("The
 * operation was aborted due to timeout"), so name what actually happened —
 * that text reaches the user verbatim through the connect dialog.
 */
export function raisedMessage(e: unknown, providerId: string): string {
  if (
    e instanceof Error &&
    (e.name === "TimeoutError" || e.name === "AbortError")
  ) {
    return `${providerId} did not answer within ${VERIFY_TIMEOUT_MS / 1000}s`;
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Why a key failed verification, carried on the wire (`/auth/:provider/api-key`
 * 401 body `reason`) so the connect dialog can show actionable copy instead of
 * a generic failure:
 *  - `invalid_key` — the provider rejected the credential itself; re-paste.
 *  - `key_restricted` — the key authenticates but something on the ACCOUNT's
 *    side blocks Houston (Google: the Gemini API is not enabled on the key's
 *    Cloud project, or a referrer/IP allowlist a server-side call can never
 *    satisfy; NVIDIA: no chat model is being served to the account); the fix
 *    lives in the provider's account settings, not in re-pasting this key.
 *  - `provider_unavailable` — no verdict (5xx / network / timeout); retry.
 */
export type ApiKeyVerifyReason =
  | "invalid_key"
  | "key_restricted"
  | "provider_unavailable";

export class ApiKeyVerifyError extends Error {
  constructor(
    message: string,
    public readonly reason: ApiKeyVerifyReason,
  ) {
    super(message);
    this.name = "ApiKeyVerifyError";
  }
}

export function rejected(
  providerId: string,
  message: string,
): ApiKeyVerifyError {
  return new ApiKeyVerifyError(
    `${providerId} rejected this API key — check the key and paste it again (${message})`,
    "invalid_key",
  );
}

export function noVerdict(
  providerId: string,
  message: string,
): ApiKeyVerifyError {
  return new ApiKeyVerifyError(
    `could not verify the ${providerId} API key: ${message} — the key was not saved; try again`,
    "provider_unavailable",
  );
}
