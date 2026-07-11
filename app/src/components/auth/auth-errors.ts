/**
 * Map a typed identity failure to a localized copy key.
 *
 * The identity layer classifies every sign-in failure ONCE into a stable
 * `IdentityErrorCode` (see `lib/identity/errors.ts`). Here we collapse those
 * codes into the small set of user-facing buckets the sign-in UI knows how to
 * phrase, returning a key within the `errors` i18n namespace. Components render
 * it with `t(authErrorKey(x))` under `useTranslation("errors")`.
 *
 * The mapping is an exhaustive `Record<IdentityErrorCode, ...>`, so adding a
 * new identity code fails to compile until it is placed in a bucket — the same
 * fail-loud design as the error taxonomy itself.
 */

import {
  type IdentityErrorCode,
  isIdentityError,
} from "../../lib/identity/errors.ts";

/** User-facing copy buckets, keyed within the `errors` namespace. */
type AuthErrorKey =
  | "auth.invalidCredentials"
  | "auth.credentialMismatch"
  | "auth.providerDisabled"
  | "auth.otpInvalid"
  | "auth.otpRateLimited"
  | "auth.network"
  | "auth.tooManyAttempts"
  | "auth.userDisabled"
  | "auth.configError"
  | "auth.generic";

const CODE_TO_KEY: Record<IdentityErrorCode, AuthErrorKey> = {
  invalid_credentials: "auth.invalidCredentials",
  credential_mismatch: "auth.credentialMismatch",
  email_exists: "auth.credentialMismatch",
  operation_not_allowed: "auth.providerDisabled",
  otp_invalid_code: "auth.otpInvalid",
  token_expired: "auth.otpInvalid",
  otp_rate_limited: "auth.otpRateLimited",
  network: "auth.network",
  too_many_attempts: "auth.tooManyAttempts",
  user_disabled: "auth.userDisabled",
  api_key_invalid: "auth.configError",
  invalid_custom_token: "auth.configError",
  invalid_idp_response: "auth.configError",
  malformed_response: "auth.configError",
  invalid_refresh_token: "auth.configError",
  unknown: "auth.generic",
};

/**
 * Resolve any sign-in failure to a localized copy key. Accepts an
 * `IdentityError` instance, a bare `IdentityErrorCode` string (the shape
 * `onAuthError` delivers post-hand-off), or anything else (→ generic).
 */
export function authErrorKey(input: unknown): string {
  if (isIdentityError(input)) return CODE_TO_KEY[input.code];
  if (typeof input === "string" && input in CODE_TO_KEY) {
    return CODE_TO_KEY[input as IdentityErrorCode];
  }
  return "auth.generic";
}
