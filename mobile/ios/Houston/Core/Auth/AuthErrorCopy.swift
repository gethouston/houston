import Foundation

/// Map any sign-in failure to localized user copy — the iOS mirror of the
/// desktop's `auth-errors.ts` bucket map. The identity layer classifies every
/// failure ONCE into an `IdentityErrorCode`; here those codes collapse into
/// the small set of user-facing phrasings (`Strings.Auth.Errors`). Exhaustive
/// switch — a new code fails to compile until it is placed in a bucket.
enum AuthErrorCopy {
    static func message(for error: Error) -> String {
        guard let identity = error as? IdentityError else {
            return Strings.Auth.Errors.generic
        }
        return switch identity.code {
        case .invalidCredentials: Strings.Auth.Errors.invalidCredentials
        case .credentialMismatch, .emailExists: Strings.Auth.Errors.credentialMismatch
        case .operationNotAllowed: Strings.Auth.Errors.providerDisabled
        case .otpInvalidCode, .tokenExpired: Strings.Auth.Errors.otpInvalid
        case .otpRateLimited: Strings.Auth.Errors.otpRateLimited
        case .network: Strings.Auth.Errors.network
        case .tooManyAttempts: Strings.Auth.Errors.tooManyAttempts
        case .userDisabled: Strings.Auth.Errors.userDisabled
        case .apiKeyInvalid, .invalidCustomToken, .invalidIdpResponse,
             .malformedResponse, .invalidRefreshToken: Strings.Auth.Errors.configError
        case .unknown: Strings.Auth.Errors.generic
        }
    }
}
