import { ApiKeyVerifyError } from "./verify-errors";

export const HUGGINGFACE_PROVIDER_ID = "huggingface";

/**
 * Hugging Face answers a fine-grained token that lacks the "Make calls to
 * Inference Providers" permission with 403 `"This authentication method does
 * not have sufficient permissions to call Inference Providers on behalf of
 * user <name>"`. The token itself authenticated (a garbage token gets 401
 * "Invalid credentials"), so this is a `key_restricted` verdict — the remedy
 * is the token's permissions page, not re-pasting it (PRODUCT-1730).
 */
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
