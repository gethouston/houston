import AuthenticationServices
import UIKit

/// Thin async wrapper over `ASWebAuthenticationSession` for the Google /
/// Microsoft OAuth hops.
///
/// `prefersEphemeralWebBrowserSession = false` deliberately keeps provider SSO
/// cookies, so a returning user skips the account chooser. The callback scheme
/// is per flow: Google's reversed-client-ID scheme, or Houston's registered
/// custom scheme (`houston`) for Microsoft.
@MainActor
final class WebAuthSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    enum WebAuthError: Error {
        case cancelled
        case noCallback
        case underlying(Error)
    }

    private var session: ASWebAuthenticationSession?

    /// Open `url`, wait for the `<callbackScheme>://` redirect, return its URL.
    /// Throws `.cancelled` when the user dismisses the browser sheet.
    func start(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                if let error {
                    if let asError = error as? ASWebAuthenticationSessionError,
                       asError.code == .canceledLogin {
                        continuation.resume(throwing: WebAuthError.cancelled)
                    } else {
                        continuation.resume(throwing: WebAuthError.underlying(error))
                    }
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: WebAuthError.noCallback)
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                continuation.resume(throwing: WebAuthError.noCallback)
            }
        }
    }

    func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let anchor = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }?
            .keyWindow
        return anchor ?? ASPresentationAnchor()
    }
}
