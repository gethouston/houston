import Foundation

/// The Google / Microsoft browser flows and the email 6-digit-code flow.
/// (Native Sign in with Apple lives in `AuthController+Apple.swift`.)
extension AuthController {
    /// Begin Google sign-in: browser PKCE hop → provider id_token → GCIP.
    func signInWithGoogle() async {
        await signInFederated(
            spec: ProviderSpecs.google(clientID: config.googleClientID),
            provider: .google
        )
    }

    /// Begin Microsoft sign-in: same shape against the Entra public client.
    func signInWithMicrosoft() async {
        await signInFederated(
            spec: ProviderSpecs.microsoft(clientID: config.microsoftClientID),
            provider: .microsoft
        )
    }

    /// Shared federated path: authorize in the system browser sheet, exchange
    /// the code (PKCE, public client), then `signInWithIdp` → session.
    private func signInFederated(spec: OAuthProviderSpec, provider: AuthProviderID) async {
        guard state != .signingIn else { return }
        state = .signingIn
        errorMessage = nil
        do {
            let flow = OAuthCodeFlow(spec: spec, session: urlSession)
            let idToken = try await flow.run(web: WebAuthSession())
            let idp = try await gcip.signInWithIdp(
                providerId: provider.rawValue, idToken: idToken)
            try await adopt(AuthSession(idp: idp, provider: provider))
        } catch WebAuthSession.WebAuthError.cancelled {
            // User backed out of the browser sheet — return quietly, no banner.
            state = .signedOut
        } catch {
            errorMessage = AuthErrorCopy.message(for: error)
            state = .signedOut
        }
    }

    /// Request a 6-digit code for `email`. Returns true when the code was sent
    /// (the view then advances to the code step); on failure surfaces the error
    /// and stays put. Does not toggle `state` — the user is still signed out.
    func startEmailCode(email: String) async -> Bool {
        errorMessage = nil
        do {
            try await otp.start(email: email)
            return true
        } catch {
            errorMessage = AuthErrorCopy.message(for: error)
            return false
        }
    }

    /// Verify the typed code: gateway → GCIP custom token → session.
    func verifyEmailCode(email: String, code: String) async {
        guard state != .signingIn else { return }
        state = .signingIn
        errorMessage = nil
        do {
            let customToken = try await otp.verify(email: email, code: code)
            let tokens = try await gcip.signInWithCustomToken(customToken)
            guard let session = AuthSession(tokens: tokens) else {
                throw IdentityError(.malformedResponse, rawCode: "custom_token_claims")
            }
            try await adopt(session)
        } catch {
            errorMessage = AuthErrorCopy.message(for: error)
            state = .signedOut
        }
    }
}
