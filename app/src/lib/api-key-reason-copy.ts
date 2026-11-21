import type { ApiKeyConnectReason } from "./api-key-connect-error";

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
