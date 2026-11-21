import { ApiKeyVerifyError } from "./verify-errors";

export const HUGGINGFACE_PROVIDER_ID = "huggingface";

export function huggingfaceInferenceGated(
  providerId: string,
  message: string,
): ApiKeyVerifyError | null {
  if (providerId !== HUGGINGFACE_PROVIDER_ID) return null;
  const lower = message.toLowerCase();
  if (!lower.includes("inference providers") || !lower.includes("permission"))
    return null;
  return new ApiKeyVerifyError(
    `this ${providerId} token is not allowed to call Inference Providers — create a token with "Make calls to Inference Providers" enabled (${message})`,
    "key_restricted",
  );
}
