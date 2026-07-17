import AuthenticationServices
import Foundation

/// Native Sign in with Apple. The view renders SwiftUI's
/// `SignInWithAppleButton`, which calls `prepareAppleRequest` to configure the
/// request and `completeAppleSignIn` with the result; the controller owns the
/// nonce lifecycle and the GCIP exchange.
extension AuthController {
    /// Configure the ASAuthorization request: scopes + the HASHED nonce (Apple
    /// embeds it in the identity token; GCIP verifies against the raw value).
    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let raw = AppleNonce.random()
        pendingAppleNonce = raw
        request.requestedScopes = [.fullName, .email]
        request.nonce = AppleNonce.sha256Hex(raw)
    }

    /// Exchange Apple's identity token for a GCIP session.
    func completeAppleSignIn(_ result: Result<ASAuthorization, Error>) async {
        guard let rawNonce = pendingAppleNonce else {
            // Completion without a prepared request — a programmer error made
            // visible rather than a replayable sign-in.
            errorMessage = AuthErrorCopy.message(for: IdentityError(.invalidIdpResponse, rawCode: "missing_nonce"))
            return
        }
        pendingAppleNonce = nil

        switch result {
        case let .failure(error):
            if let asError = error as? ASAuthorizationError, asError.code == .canceled {
                // User dismissed the Apple sheet — quiet, no banner.
                state = .signedOut
                return
            }
            errorMessage = AuthErrorCopy.message(for: error)
            state = .signedOut
        case let .success(authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let idToken = String(data: tokenData, encoding: .utf8)
            else {
                errorMessage = AuthErrorCopy.message(for: IdentityError(.invalidIdpResponse, rawCode: "apple_missing_identity_token"))
                state = .signedOut
                return
            }
            state = .signingIn
            errorMessage = nil
            do {
                let idp = try await gcip.signInWithIdp(
                    providerId: AuthProviderID.apple.rawValue,
                    idToken: idToken,
                    rawNonce: rawNonce
                )
                // Apple supplies the name ONLY on first authorization, and only
                // natively — carry it into the session when GCIP has none.
                try await adopt(AuthSession(
                    idp: idp,
                    provider: .apple,
                    fallbackDisplayName: Self.formattedName(credential.fullName)
                ))
            } catch {
                errorMessage = AuthErrorCopy.message(for: error)
                state = .signedOut
            }
        }
    }

    /// A displayable name from Apple's components, or `nil` when empty.
    static func formattedName(_ components: PersonNameComponents?) -> String? {
        guard let components else { return nil }
        let formatted = PersonNameComponentsFormatter.localizedString(
            from: components, style: .default)
        return formatted.isEmpty ? nil : formatted
    }
}
