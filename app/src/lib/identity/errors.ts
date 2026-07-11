// Error taxonomy for the GCP Identity Platform (Firebase Auth) client.
//
// Every REST/gateway failure is mapped ONCE, here, to a stable discriminated
// `IdentityErrorCode`. Downstream code (auth.ts toasts, refresh timer, admin
// dashboard) switches on `IdentityError.code` — it NEVER string-matches a raw
// GCIP message. Add a new code here and the exhaustive switches fail to
// compile, which is the point.

/** Stable, provider-agnostic identity failure codes. */
export type IdentityErrorCode =
  // signInWithIdp / password / custom-token
  | "email_exists" // EMAIL_EXISTS
  | "invalid_idp_response" // INVALID_IDP_RESPONSE / MISSING_OR_INVALID_NONCE
  | "invalid_credentials" // INVALID_PASSWORD / EMAIL_NOT_FOUND / INVALID_LOGIN_CREDENTIALS / USER_NOT_FOUND
  | "credential_mismatch" // FEDERATED_USER_ID_ALREADY_LINKED / CREDENTIAL_MISMATCH
  | "invalid_custom_token" // INVALID_CUSTOM_TOKEN / CREDENTIAL_MISMATCH (custom)
  | "operation_not_allowed" // OPERATION_NOT_ALLOWED (provider disabled)
  // token refresh
  | "token_expired" // TOKEN_EXPIRED
  | "invalid_refresh_token" // INVALID_REFRESH_TOKEN / MISSING_REFRESH_TOKEN / INVALID_GRANT_TYPE
  // account state
  | "user_disabled" // USER_DISABLED
  // config / rate
  | "api_key_invalid" // API key not valid / KEY_INVALID / CONFIGURATION_NOT_FOUND
  | "too_many_attempts" // TOO_MANY_ATTEMPTS_TRY_LATER
  // gateway email-OTP flow
  | "otp_invalid_code" // gateway 401: wrong / expired 6-digit code
  | "otp_rate_limited" // gateway 429: too many start/verify requests
  // transport
  | "network" // fetch threw (offline, DNS, TLS) — no HTTP response
  | "malformed_response" // 2xx but body is not the expected shape / non-JSON
  | "unknown"; // a recognized GCIP error shape with an unmapped code

/** A single, typed identity failure. `code` is the only thing to branch on. */
export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  /** The raw GCIP message code (e.g. "EMAIL_EXISTS"), when there was one. */
  readonly rawCode?: string;
  /** The HTTP status, when a response was received. */
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

/** Type guard for exhaustive downstream handling. */
export function isIdentityError(e: unknown): e is IdentityError {
  return e instanceof IdentityError;
}

// GCIP puts the machine-readable code in `error.message`, sometimes suffixed
// with a human detail after " : " (e.g. "INVALID_LOGIN_CREDENTIALS : ...").
const GCIP_CODE_MAP: Record<string, IdentityErrorCode> = {
  EMAIL_EXISTS: "email_exists",
  INVALID_IDP_RESPONSE: "invalid_idp_response",
  MISSING_OR_INVALID_NONCE: "invalid_idp_response",
  INVALID_PASSWORD: "invalid_credentials",
  EMAIL_NOT_FOUND: "invalid_credentials",
  INVALID_LOGIN_CREDENTIALS: "invalid_credentials",
  USER_NOT_FOUND: "invalid_credentials",
  FEDERATED_USER_ID_ALREADY_LINKED: "credential_mismatch",
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

/** Map a raw GCIP `error.message` code to a stable `IdentityErrorCode`. */
export function mapGcipCode(rawMessage: string): IdentityErrorCode {
  const code = rawMessage.split(" : ")[0]?.trim() ?? "";
  if (code in GCIP_CODE_MAP) return GCIP_CODE_MAP[code];
  // "API key not valid. Please pass a valid API key." has no clean code token.
  if (/api key not valid/i.test(rawMessage)) return "api_key_invalid";
  return "unknown";
}
