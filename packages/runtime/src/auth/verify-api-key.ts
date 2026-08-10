import { completeSimple } from "@earendil-works/pi-ai/compat";
import { classifyProviderError } from "../ai/provider-error";
import { modelFor, safeGetModel } from "../ai/providers";
import { QWEN_PROVIDER_ID } from "../ai/qwen-dashscope";
import { nvidiaGated, retryNvidiaFallbacks } from "./nvidia-verify";
import { verifyQwenRegions } from "./qwen-verify";
import {
  ApiKeyVerifyError,
  noVerdict,
  PROVES_AUTH,
  raisedMessage,
  rejected,
  VERIFY_TIMEOUT_MS,
} from "./verify-errors";

export type { ApiKeyVerifyReason } from "./verify-errors";
// The stable public surface (host routes, login, tests) predates the module
// split — keep serving it from here.
export { ApiKeyVerifyError, raisedMessage } from "./verify-errors";

/**
 * Prove a pasted API key actually authenticates before it is stored (HOU: any
 * pasted string — even "aa" — used to read "connected" and only fail on the
 * first chat turn). One 1-token completion against the model a chat would use,
 * with the CANDIDATE key passed per-request (`StreamOptions.apiKey`) so nothing
 * touches auth.json until the provider accepts it. Two provider exceptions:
 * Google rides the models-LIST endpoint (`verifyGoogleApiKey`), and NVIDIA
 * retries broadly-served models when the probe model is gated per-account
 * (`nvidia-verify.ts`, HOU-890).
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

export async function verifyApiKey(
  providerId: string,
  key: string,
): Promise<void> {
  // Qwen keys are REGION-scoped (Alibaba Model Studio international): probe
  // every region and persist the accepting one (`qwen-verify.ts`, HOU-1077).
  if (providerId === QWEN_PROVIDER_ID) {
    await verifyQwenRegions(providerId, (m) =>
      probeCompletion(providerId, m, key),
    );
    return;
  }

  const model = safeGetModel(providerId, modelFor(providerId), false);
  if (!model)
    throw new Error(`${providerId} offers no model to verify the key against`);

  if (model.api === "google-generative-ai" && model.baseUrl) {
    await verifyGoogleApiKey(providerId, model.baseUrl, key);
    return;
  }

  let message = await probeCompletion(providerId, model, key);
  if (message === null) return;

  // NVIDIA serves each model per account (HOU-890): the probe model being
  // gated proves nothing about the KEY, so retry broadly-served models before
  // any verdict (all-gated throws key_restricted from nvidia-verify.ts).
  if (nvidiaGated(providerId, message)) {
    message = await retryNvidiaFallbacks(providerId, model.id, message, (m) =>
      probeCompletion(providerId, m, key),
    );
    if (message === null) return;
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
 * One 1-token completion probe. `null` = the provider ACCEPTED the request
 * (key verified); otherwise the failure text for classification.
 */
async function probeCompletion(
  providerId: string,
  model: Parameters<typeof completeSimple>[0],
  key: string,
): Promise<string | null> {
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
    if (reply.stopReason !== "error") return null;
    return reply.errorMessage ?? "unknown provider error";
  } catch (e) {
    // pi raises (rather than resolving an errored message) for pre-request
    // failures; a timeout lands here too. Same classification path.
    return raisedMessage(e, providerId);
  }
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
    throw noVerdict(providerId, raisedMessage(e, providerId));
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
