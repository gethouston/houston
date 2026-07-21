import { completeSimple } from "@earendil-works/pi-ai/compat";
import { classifyProviderError } from "../ai/provider-error";
import { modelFor, safeGetModel } from "../ai/providers";

/**
 * Prove a pasted API key actually authenticates before it is stored (HOU: any
 * pasted string — even "aa" — used to read "connected" and only fail on the
 * first chat turn). One 1-token completion against the model a chat would use,
 * with the CANDIDATE key passed per-request (`StreamOptions.apiKey`) so nothing
 * touches auth.json until the provider accepts it. Google is the exception —
 * see `verifyGoogleApiKey`.
 *
 * Accept/reject is decided on the shared `ProviderError` taxonomy:
 *  - the completion succeeds → verified;
 *  - `rate_limited` / `quota_exhausted` / `model_unavailable` /
 *    `context_overflow` → verified — each of those answers PAST auth (a garbage
 *    key can't be rate-limited or out of credit);
 *  - everything else (`unauthenticated`, `network_unreachable`,
 *    `provider_internal`, `unknown`) → reject with the provider's own message,
 *    and the key is NOT stored. Beta policy: a connect that can't be proven is
 *    a visible failure, never a silent "connected".
 */
const VERIFY_TIMEOUT_MS = 20_000;

/** Error kinds that prove the credential was ACCEPTED by the provider. */
const PROVES_AUTH = new Set([
  "rate_limited",
  "quota_exhausted",
  "model_unavailable",
  "context_overflow",
]);

/**
 * Why a key failed verification, carried on the wire (`/auth/:provider/api-key`
 * 401 body `reason`) so the connect dialog can show actionable copy instead of
 * a generic failure:
 *  - `invalid_key` — the provider rejected the credential itself; re-paste.
 *  - `key_restricted` — the key authenticates but its OWN settings block
 *    Houston (Google: the Gemini API is not enabled on the key's Cloud
 *    project, or a referrer/IP allowlist a server-side call can never
 *    satisfy); the fix is a new unrestricted key, not re-pasting this one.
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

export async function verifyApiKey(
  providerId: string,
  key: string,
): Promise<void> {
  const model = safeGetModel(providerId, modelFor(providerId), false);
  if (!model)
    throw new Error(`${providerId} offers no model to verify the key against`);

  if (model.api === "google-generative-ai" && model.baseUrl) {
    await verifyGoogleApiKey(providerId, model.baseUrl, key);
    return;
  }

  let message: string;
  try {
    const reply = await completeSimple(
      model,
      {
        messages: [{ role: "user", content: "ping", timestamp: Date.now() }],
      },
      {
        apiKey: key,
        maxTokens: 1,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      },
    );
    if (reply.stopReason !== "error") return;
    message = reply.errorMessage ?? "unknown provider error";
  } catch (e) {
    // pi raises (rather than resolving an errored message) for pre-request
    // failures; a timeout lands here too. Same classification path.
    message = e instanceof Error ? e.message : String(e);
  }

  const classified = classifyProviderError({
    provider: providerId,
    model: model.id,
    message,
  });
  if (PROVES_AUTH.has(classified.kind)) return;
  if (classified.kind === "unauthenticated")
    throw rejected(providerId, message);
  throw noVerdict(providerId, message);
}

/**
 * Google keys are verified against the cheap models-LIST endpoint instead of a
 * completion. A completion probe hits a real model, so Google's "high demand"
 * 503 used to fail verification of a perfectly good key; the list endpoint
 * exercises ONLY the credential. It also keeps Google's actionable 403s
 * distinguishable — API-not-enabled-on-the-project and referrer-restricted
 * keys (the two failures Windows beta users actually hit) are `key_restricted`,
 * never a generic "try again". The key rides a header, not the query string,
 * so it can't leak into request logs.
 */
async function verifyGoogleApiKey(
  providerId: string,
  baseUrl: string,
  key: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models?pageSize=1`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (e) {
    throw noVerdict(providerId, e instanceof Error ? e.message : String(e));
  }
  if (res.ok) return;
  // Throttled = the key authenticated; a garbage key can't be rate-limited.
  if (res.status === 429) return;
  const message = await googleErrorMessage(res);
  if (res.status === 400 || res.status === 401)
    throw rejected(providerId, message);
  if (res.status === 403) {
    throw new ApiKeyVerifyError(
      `this ${providerId} API key is blocked by its own settings: ${message}`,
      "key_restricted",
    );
  }
  throw noVerdict(providerId, message);
}

/** Google's error body is `{error:{message,…}}`; fall back to raw text/status. */
async function googleErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Not JSON — surface the raw body below.
  }
  return text || `status ${res.status}`;
}

function rejected(providerId: string, message: string): ApiKeyVerifyError {
  return new ApiKeyVerifyError(
    `${providerId} rejected this API key — check the key and paste it again (${message})`,
    "invalid_key",
  );
}

function noVerdict(providerId: string, message: string): ApiKeyVerifyError {
  return new ApiKeyVerifyError(
    `could not verify the ${providerId} API key: ${message} — the key was not saved; try again`,
    "provider_unavailable",
  );
}
