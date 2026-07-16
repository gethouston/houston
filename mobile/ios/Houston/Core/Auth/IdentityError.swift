import Foundation

/// Stable, provider-agnostic identity failure codes — the Swift mirror of the
/// desktop taxonomy (`app/src/lib/identity/errors.ts`). Every GCIP / gateway
/// failure is mapped ONCE (here) to a code; UI code switches on the code and
/// NEVER string-matches a raw GCIP message.
enum IdentityErrorCode: String, Equatable, Sendable {
    // signInWithIdp / custom-token
    case emailExists = "email_exists" // EMAIL_EXISTS
    case invalidIdpResponse = "invalid_idp_response" // INVALID_IDP_RESPONSE / MISSING_OR_INVALID_NONCE
    case invalidCredentials = "invalid_credentials" // INVALID_LOGIN_CREDENTIALS et al.
    case credentialMismatch = "credential_mismatch" // FEDERATED_USER_ID_ALREADY_LINKED / CREDENTIAL_MISMATCH
    case invalidCustomToken = "invalid_custom_token" // INVALID_CUSTOM_TOKEN
    case operationNotAllowed = "operation_not_allowed" // OPERATION_NOT_ALLOWED (provider disabled / unconfigured)
    // token refresh
    case tokenExpired = "token_expired" // TOKEN_EXPIRED
    case invalidRefreshToken = "invalid_refresh_token" // INVALID_REFRESH_TOKEN / MISSING_REFRESH_TOKEN / INVALID_GRANT_TYPE
    // account state
    case userDisabled = "user_disabled" // USER_DISABLED
    // config / rate
    case apiKeyInvalid = "api_key_invalid" // KEY_INVALID / CONFIGURATION_NOT_FOUND
    case tooManyAttempts = "too_many_attempts" // TOO_MANY_ATTEMPTS_TRY_LATER
    // gateway email-OTP flow
    case otpInvalidCode = "otp_invalid_code" // gateway 401: wrong / expired 6-digit code
    case otpRateLimited = "otp_rate_limited" // gateway 429
    // transport
    case network // request threw (offline, DNS, TLS) — no HTTP response
    case malformedResponse = "malformed_response" // 2xx but not the expected shape
    case unknown
}

/// A single, typed identity failure. `code` is the only thing to branch on;
/// `rawCode` / `httpStatus` exist for logs.
struct IdentityError: Error, Equatable {
    let code: IdentityErrorCode
    /// The raw GCIP message code (e.g. "EMAIL_EXISTS"), when there was one.
    var rawCode: String?
    /// The HTTP status, when a response was received.
    var httpStatus: Int?

    init(_ code: IdentityErrorCode, rawCode: String? = nil, httpStatus: Int? = nil) {
        self.code = code
        self.rawCode = rawCode
        self.httpStatus = httpStatus
    }

    // GCIP puts the machine-readable code in `error.message`, sometimes
    // suffixed with a human detail after " : ". Same table as the desktop's
    // GCIP_CODE_MAP — keep the two in sync.
    private static let gcipCodeMap: [String: IdentityErrorCode] = [
        "EMAIL_EXISTS": .emailExists,
        "INVALID_IDP_RESPONSE": .invalidIdpResponse,
        "MISSING_OR_INVALID_NONCE": .invalidIdpResponse,
        "INVALID_PASSWORD": .invalidCredentials,
        "EMAIL_NOT_FOUND": .invalidCredentials,
        "INVALID_LOGIN_CREDENTIALS": .invalidCredentials,
        "USER_NOT_FOUND": .invalidCredentials,
        "FEDERATED_USER_ID_ALREADY_LINKED": .credentialMismatch,
        "CREDENTIAL_MISMATCH": .credentialMismatch,
        "INVALID_CUSTOM_TOKEN": .invalidCustomToken,
        "CREDENTIAL_TOO_OLD_LOGIN_AGAIN": .tokenExpired,
        "OPERATION_NOT_ALLOWED": .operationNotAllowed,
        "TOKEN_EXPIRED": .tokenExpired,
        "INVALID_REFRESH_TOKEN": .invalidRefreshToken,
        "MISSING_REFRESH_TOKEN": .invalidRefreshToken,
        "INVALID_GRANT_TYPE": .invalidRefreshToken,
        "USER_DISABLED": .userDisabled,
        "KEY_INVALID": .apiKeyInvalid,
        "CONFIGURATION_NOT_FOUND": .apiKeyInvalid,
        "TOO_MANY_ATTEMPTS_TRY_LATER": .tooManyAttempts,
    ]

    /// Map a raw GCIP `error.message` to a typed error, preserving the raw code.
    static func fromGcipMessage(_ rawMessage: String, httpStatus: Int) -> IdentityError {
        let code = rawMessage.components(separatedBy: " : ").first?
            .trimmingCharacters(in: .whitespaces) ?? ""
        if let mapped = gcipCodeMap[code] {
            return IdentityError(mapped, rawCode: code, httpStatus: httpStatus)
        }
        // "API key not valid. Please pass a valid API key." has no clean code token.
        if rawMessage.range(of: "api key not valid", options: .caseInsensitive) != nil {
            return IdentityError(.apiKeyInvalid, rawCode: code, httpStatus: httpStatus)
        }
        return IdentityError(.unknown, rawCode: code.isEmpty ? nil : code, httpStatus: httpStatus)
    }
}
