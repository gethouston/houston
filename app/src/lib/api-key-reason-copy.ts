import type { ApiKeyConnectReason } from "./api-key-connect-error";

/** Verification verdicts (from the engine's typed `reason`) → inline copy. */
const REASON_COPY = {
  invalid_key: "apiKey.errorInvalidKey",
  key_restricted: "apiKey.errorKeyRestricted",
  provider_unavailable: "apiKey.errorProviderUnavailable",
} as const satisfies Record<ApiKeyConnectReason, string>;

export type ApiKeyReasonCopyKey =
  | (typeof REASON_COPY)[ApiKeyConnectReason]
  | "apiKey.errorNvidiaAccountGated"
  | "apiKey.errorBedrockInvalidKey"
  | "apiKey.errorHuggingfaceInferenceGated"
  | "apiKey.errorGoogleKeyRestricted";

/**
 * The `providers` namespace key the connect dialog renders for a verdict.
 * Providers whose rejection has a KNOWN remedy get their own sentence; the
 * generic "check the key" / "create a key without restrictions" copy sent
 * those users in circles:
 *  - NVIDIA `key_restricted` is an ACCOUNT gate: NVIDIA has to enable
 *    "Public API Endpoints" on the account's org (HOU-890).
 *  - Bedrock's console lists keys by NAME and shows the VALUE once, so a
 *    rejected key is usually the name pasted in place of the value
 *    (PRODUCT-1477).
 *  - Hugging Face `key_restricted` is a fine-grained token missing the
 *    "Make calls to Inference Providers" permission (PRODUCT-1730).
 *  - Google `key_restricted` is the key's own restrictions in AI Studio /
 *    Cloud Console, or the Gemini API not enabled on its project
 *    (PRODUCT-1730).
 */
export function apiKeyReasonCopyKey(
  providerId: string,
  reason: ApiKeyConnectReason,
): ApiKeyReasonCopyKey {
  if (reason === "key_restricted") {
    if (providerId === "nvidia") return "apiKey.errorNvidiaAccountGated";
    if (providerId === "huggingface")
      return "apiKey.errorHuggingfaceInferenceGated";
    if (providerId === "google") return "apiKey.errorGoogleKeyRestricted";
  }
  if (providerId === "amazon-bedrock" && reason === "invalid_key")
    return "apiKey.errorBedrockInvalidKey";
  return REASON_COPY[reason];
}
