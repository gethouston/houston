import Foundation

/// The parsed result of the OAuth redirect `ASWebAuthenticationSession` hands
/// back after provider consent (Google / Microsoft browser flows).
///
/// The code flow returns the one-time code (+ echoed `state`) as query
/// parameters; a denied/failed consent returns `?error=...&error_description=...`.
enum AuthCallback: Equatable {
    /// Success: the authorization code to exchange, plus the echoed `state`
    /// (`nil` when the provider omitted it — callers treat that as a mismatch).
    case code(String, state: String?)
    /// The provider returned an OAuth error.
    case error(code: String, description: String?)

    /// Parse a callback URL. Returns `nil` when the URL is not a recognizable
    /// auth callback (neither `code` nor `error` present).
    static func parse(_ url: URL) -> AuthCallback? {
        guard let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        // The code flow puts params in the query. Some error shapes arrive in
        // the fragment; fold both so a fragment-delivered error still surfaces.
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
            return .code(code, state: value("state"))
        }
        if let err = value("error") {
            return .error(code: err, description: value("error_description"))
        }
        return nil
    }
}
