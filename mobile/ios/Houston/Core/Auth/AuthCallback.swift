import Foundation

/// The parsed result of the `houston://auth-callback` redirect that
/// `ASWebAuthenticationSession` hands back after Google consent.
///
/// The PKCE flow returns the one-time code as a query parameter
/// (`houston://auth-callback?code=...`); a denied/failed consent returns
/// `?error=...&error_description=...`.
enum AuthCallback: Equatable {
    /// Success: the authorization code to exchange for a session.
    case code(String)
    /// The provider or Supabase returned an OAuth error.
    case error(code: String, description: String?)

    /// Parse a callback URL. Returns `nil` when the URL is not a recognizable
    /// auth callback (neither `code` nor `error` present).
    static func parse(_ url: URL) -> AuthCallback? {
        guard let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        // GoTrue puts PKCE params in the query. Some error shapes arrive in the
        // fragment; fold both so a fragment-delivered error is still surfaced.
        var items = comps.queryItems ?? []
        if let fragment = comps.fragment, !fragment.isEmpty {
            var fragComps = URLComponents()
            fragComps.query = fragment
            items.append(contentsOf: fragComps.queryItems ?? [])
        }
        func value(_ name: String) -> String? {
            items.first { $0.name == name }?.value.flatMap { $0.isEmpty ? nil : $0 }
        }
        if let code = value("code") {
            return .code(code)
        }
        if let err = value("error") {
            return .error(code: err, description: value("error_description"))
        }
        return nil
    }
}
