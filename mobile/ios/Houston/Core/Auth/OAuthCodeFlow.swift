import Foundation

/// Everything provider-specific about a browser OAuth authorization-code
/// flow. Google and Microsoft supply instances (`ProviderSpecs.swift`); the
/// driver below is provider-agnostic — the iOS analogue of the desktop's
/// `identity/desktop-oauth.ts`, with `ASWebAuthenticationSession` playing the
/// role of the loopback server.
struct OAuthProviderSpec: Equatable, Sendable {
    let authorizeBase: String
    let tokenEndpoint: String
    let clientID: String
    let scope: String
    /// Where the provider redirects back to (a custom scheme on iOS).
    let redirectURI: String
    /// The scheme `ASWebAuthenticationSession` matches the callback on.
    let callbackScheme: String
    /// Provider-specific authorize-URL extras (e.g. `prompt=select_account`).
    let extraAuthorizeParams: [String: String]
    /// Provider-specific token-exchange extras (e.g. Microsoft resends `scope`).
    let extraTokenParams: [String: String]
}

/// Drives one authorize → callback → code-exchange round trip and returns the
/// provider's OIDC `id_token` (the credential `signInWithIdp` consumes).
/// PKCE (S256) + `state` on every run. All failures are typed
/// `IdentityError`s except the user closing the sheet, which surfaces as
/// `WebAuthSession.WebAuthError.cancelled` for callers to treat as benign.
struct OAuthCodeFlow {
    let spec: OAuthProviderSpec
    let session: URLSession

    init(spec: OAuthProviderSpec, session: URLSession = .shared) {
        self.spec = spec
        self.session = session
    }

    /// Build the browser authorize URL. Pure — unit tests pin the exact
    /// parameter names, order, and `encodeURIComponent` escaping.
    static func authorizeURL(spec: OAuthProviderSpec, challenge: String, state: String) -> URL? {
        var params: [(String, String)] = [
            ("client_id", spec.clientID),
            ("redirect_uri", spec.redirectURI),
            ("response_type", "code"),
            ("scope", spec.scope),
            ("code_challenge", challenge),
            ("code_challenge_method", PKCE.challengeMethod),
            ("state", state),
        ]
        params.append(contentsOf: spec.extraAuthorizeParams.sorted { $0.key < $1.key })
        let query = GcipAuth.formEncode(params)
        return URL(string: "\(spec.authorizeBase)?\(query)")
    }

    /// Run the full flow. `web` is injected so the browser hop stays mockable.
    @MainActor
    func run(web: WebAuthSession) async throws -> String {
        guard !spec.clientID.isEmpty else {
            // No client registered for this build — surface it, never a silent no-op.
            throw IdentityError(.operationNotAllowed, rawCode: "client_id_missing")
        }
        let verifier = PKCE.makeCodeVerifier()
        let state = PKCE.makeCodeVerifier(length: 43)
        guard let url = Self.authorizeURL(
            spec: spec, challenge: PKCE.challenge(for: verifier), state: state
        ) else {
            throw IdentityError(.malformedResponse, rawCode: "authorize_url")
        }

        let callback = try await web.start(url: url, callbackScheme: spec.callbackScheme)
        switch AuthCallback.parse(callback) {
        case let .code(code, callbackState):
            guard callbackState == state else {
                throw IdentityError(.invalidIdpResponse, rawCode: "state_mismatch")
            }
            return try await exchange(code: code, verifier: verifier)
        case let .error(code, _):
            throw IdentityError(.invalidIdpResponse, rawCode: code)
        case nil:
            throw IdentityError(.malformedResponse, rawCode: "unrecognized_callback")
        }
    }

    /// Exchange the authorization code for tokens; return the OIDC `id_token`.
    /// Public PKCE clients only — no client secret is ever sent.
    private func exchange(code: String, verifier: String) async throws -> String {
        var params: [(String, String)] = [
            ("client_id", spec.clientID),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", spec.redirectURI),
            ("grant_type", "authorization_code"),
        ]
        params.append(contentsOf: spec.extraTokenParams.sorted { $0.key < $1.key })

        guard let url = URL(string: spec.tokenEndpoint) else {
            throw IdentityError(.malformedResponse, rawCode: "token_endpoint")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(GcipAuth.formEncode(params).utf8)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw IdentityError(.network)
        }
        guard let http = response as? HTTPURLResponse else {
            throw IdentityError(.network)
        }
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard (200..<300).contains(http.statusCode) else {
            // OAuth token-endpoint error shape: { "error": "...", ... }.
            let rawCode = obj?["error"] as? String
            throw IdentityError(.invalidIdpResponse, rawCode: rawCode, httpStatus: http.statusCode)
        }
        guard let idToken = obj?["id_token"] as? String, !idToken.isEmpty else {
            throw IdentityError(.malformedResponse, rawCode: "token_missing_id_token")
        }
        return idToken
    }
}
