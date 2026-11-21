import {
  type IdentityErrorCode,
  isIdentityError,
} from "../../lib/identity/errors.ts";

type AuthErrorKey =
  | "auth.invalidCredentials"
  | "auth.credentialMismatch"
  | "auth.providerDisabled"
  | "auth.otpInvalid"
  | "auth.otpRateLimited"
  | "auth.otpPasswordAccount"
  | "auth.otpEmailChanged"
  | "auth.otpUnverifiedAccount"
  | "auth.otpAccountDeleting"
  | "auth.otpAccountMerging"
  | "auth.network"
  | "auth.tooManyAttempts"
  | "auth.userDisabled"
  | "auth.configError"
  | "auth.signOutIncomplete"
  | "auth.localDataIncomplete"
  | "auth.signInTimeout"
  | "auth.generic";

const CODE_TO_KEY: Record<IdentityErrorCode, AuthErrorKey> = {
  invalid_credentials: "auth.invalidCredentials",
  credential_mismatch: "auth.credentialMismatch",
  identity_already_linked: "auth.credentialMismatch",
  email_exists: "auth.credentialMismatch",
  operation_not_allowed: "auth.providerDisabled",
  otp_invalid_code: "auth.otpInvalid",
  token_expired: "auth.otpInvalid",
  otp_rate_limited: "auth.otpRateLimited",
  otp_password_account: "auth.otpPasswordAccount",
  otp_email_changed: "auth.otpEmailChanged",
  otp_unverified_account: "auth.otpUnverifiedAccount",
  otp_account_deleting: "auth.otpAccountDeleting",
  otp_account_disabled: "auth.userDisabled",
  otp_account_merging: "auth.otpAccountMerging",
  network: "auth.network",
  too_many_attempts: "auth.tooManyAttempts",
  user_disabled: "auth.userDisabled",
  api_key_invalid: "auth.configError",
  invalid_custom_token: "auth.configError",
  invalid_idp_response: "auth.configError",
  malformed_response: "auth.configError",
  invalid_refresh_token: "auth.configError",
  session_clear_failed: "auth.signOutIncomplete",
  local_data_clear_failed: "auth.localDataIncomplete",
  browser_open_timeout: "auth.signInTimeout",
  unknown: "auth.generic",
};

export function authErrorKey(input: unknown): string {
  if (isIdentityError(input)) return CODE_TO_KEY[input.code];
  if (typeof input === "string" && input in CODE_TO_KEY) {
    return CODE_TO_KEY[input as IdentityErrorCode];
  }
  return "auth.generic";
}
