export type IdentityErrorCode =
  | "email_exists"
  | "invalid_idp_response"
  | "invalid_credentials"
  | "credential_mismatch"
  | "identity_already_linked"
  | "invalid_custom_token"
  | "operation_not_allowed"
  | "token_expired"
  | "invalid_refresh_token"
  | "user_disabled"
  | "api_key_invalid"
  | "too_many_attempts"
  | "session_clear_failed"
  | "local_data_clear_failed"
  | "browser_open_timeout"
  | "otp_invalid_code"
  | "otp_rate_limited"
  | "otp_password_account"
  | "otp_email_changed"
  | "otp_unverified_account"
  | "otp_account_deleting"
  | "otp_account_disabled"
  | "otp_account_merging"
  | "network"
  | "malformed_response"
  | "unknown";

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  readonly rawCode?: string;
  readonly httpStatus?: number;

  constructor(
    code: IdentityErrorCode,
    opts: { rawCode?: string; httpStatus?: number; cause?: unknown } = {},
  ) {
    super(
      `identity error: ${code}${opts.rawCode ? ` (${opts.rawCode})` : ""}`,
      {
        cause: opts.cause,
      },
    );
    this.name = "IdentityError";
    this.code = code;
    this.rawCode = opts.rawCode;
    this.httpStatus = opts.httpStatus;
  }
}

export function isIdentityError(e: unknown): e is IdentityError {
  return e instanceof IdentityError;
}

const GCIP_CODE_MAP: Record<string, IdentityErrorCode> = {
  EMAIL_EXISTS: "email_exists",
  INVALID_IDP_RESPONSE: "invalid_idp_response",
  MISSING_OR_INVALID_NONCE: "invalid_idp_response",
  INVALID_PASSWORD: "invalid_credentials",
  EMAIL_NOT_FOUND: "invalid_credentials",
  INVALID_LOGIN_CREDENTIALS: "invalid_credentials",
  USER_NOT_FOUND: "invalid_credentials",
  FEDERATED_USER_ID_ALREADY_LINKED: "identity_already_linked",
  CREDENTIAL_MISMATCH: "credential_mismatch",
  INVALID_CUSTOM_TOKEN: "invalid_custom_token",
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: "token_expired",
  OPERATION_NOT_ALLOWED: "operation_not_allowed",
  TOKEN_EXPIRED: "token_expired",
  INVALID_REFRESH_TOKEN: "invalid_refresh_token",
  MISSING_REFRESH_TOKEN: "invalid_refresh_token",
  INVALID_GRANT_TYPE: "invalid_refresh_token",
  USER_DISABLED: "user_disabled",
  KEY_INVALID: "api_key_invalid",
  CONFIGURATION_NOT_FOUND: "api_key_invalid",
  TOO_MANY_ATTEMPTS_TRY_LATER: "too_many_attempts",
};

export function mapGcipCode(rawMessage: string): IdentityErrorCode {
  const code = rawMessage.split(" : ")[0]?.trim() ?? "";
  if (code in GCIP_CODE_MAP) return GCIP_CODE_MAP[code];
  if (/api key not valid/i.test(rawMessage)) return "api_key_invalid";
  return "unknown";
}
