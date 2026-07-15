import { completeSimple } from "@earendil-works/pi-ai/compat";
import { classifyProviderError } from "../ai/provider-error";
import { modelFor, safeGetModel } from "../ai/providers";

/**
 * Prove a pasted API key actually authenticates before it is stored (HOU: any
 * pasted string — even "aa" — used to read "connected" and only fail on the
 * first chat turn). One 1-token completion against the model a chat would use,
 * with the CANDIDATE key passed per-request (`StreamOptions.apiKey`) so nothing
 * touches auth.json until the provider accepts it.
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

export async function verifyApiKey(
  providerId: string,
  key: string,
): Promise<void> {
  const model = safeGetModel(providerId, modelFor(providerId), false);
  if (!model)
    throw new Error(`${providerId} offers no model to verify the key against`);

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
  if (classified.kind === "unauthenticated") {
    throw new Error(
      `${providerId} rejected this API key — check the key and paste it again (${message})`,
    );
  }
  throw new Error(
    `could not verify the ${providerId} API key: ${message} — the key was not saved; try again`,
  );
}
