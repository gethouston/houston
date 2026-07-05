import Foundation

/// Endpoints + credentials for a Supabase GoTrue auth server.
struct SupabaseAuthConfig {
    /// Project base, e.g. `https://xxxx.supabase.co`.
    let baseURL: URL
    /// The public anon key — sent as both `apikey` and bearer on token requests.
    let anonKey: String
    /// The registered redirect target (custom scheme), e.g. `houston://auth-callback`.
    let redirectURL: String

    /// GoTrue root: `<baseURL>/auth/v1`.
    var authRoot: URL { baseURL.appendingPathComponent("auth/v1") }

    /// The custom URL scheme `ASWebAuthenticationSession` matches on, derived
    /// from `redirectURL` (`houston://auth-callback` → `houston`).
    var callbackScheme: String { URL(string: redirectURL)?.scheme ?? "houston" }
}

/// Failures from the GoTrue token endpoints, surfaced to the user by the
/// `AuthController` (never swallowed).
enum SupabaseAuthError: Error {
    case malformedURL
    case badResponse(status: Int, body: String)
    case transport(Error)
}

/// The native mirror of supabase-js's PKCE auth: builds the browser authorize
/// URL and performs the `/token` exchange + refresh over `URLSession`.
///
/// Wire contract verified against `@supabase/auth-js@2.104.1`:
/// - authorize: `GET <root>/authorize?provider&redirect_to&code_challenge&code_challenge_method`
///   (no `flow_type` param — supabase-js does not send one).
/// - exchange:  `POST <root>/token?grant_type=pkce`  `{ auth_code, code_verifier }`.
/// - refresh:   `POST <root>/token?grant_type=refresh_token`  `{ refresh_token }`.
struct SupabaseAuth {
    let config: SupabaseAuthConfig
    let session: URLSession

    init(config: SupabaseAuthConfig, session: URLSession = .shared) {
        self.config = config
        self.session = session
    }

    /// The `encodeURIComponent` allowed set — alphanumerics plus `-_.!~*'()`.
    /// Matches supabase-js, which wraps every authorize param in
    /// `encodeURIComponent(...)`, so `redirect_to`'s `:` / `/` become `%3A`/`%2F`.
    private static let componentAllowed: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-_.!~*'()")
        return set
    }()

    private static func encodeComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: componentAllowed) ?? value
    }

    /// Build the browser authorize URL for a provider's PKCE flow. Pure —
    /// unit-tested against the exact supabase-js parameter names, order, and
    /// `encodeURIComponent` escaping. Deliberately hand-builds the query (rather
    /// than `URLComponents.queryItems`, which leaves `:`/`/` unescaped) so the
    /// wire bytes match what the proven desktop flow sends.
    static func authorizeURL(
        config: SupabaseAuthConfig,
        provider: String,
        challenge: String
    ) -> URL? {
        let params = [
            ("provider", provider),
            ("redirect_to", config.redirectURL),
            ("code_challenge", challenge),
            ("code_challenge_method", PKCE.challengeMethod),
        ]
        let query = params
            .map { "\($0.0)=\(encodeComponent($0.1))" }
            .joined(separator: "&")
        let endpoint = config.authRoot.appendingPathComponent("authorize").absoluteString
        return URL(string: "\(endpoint)?\(query)")
    }

    func authorizeURL(provider: String, challenge: String) -> URL? {
        Self.authorizeURL(config: config, provider: provider, challenge: challenge)
    }

    /// Exchange the authorization `code` for a session (`grant_type=pkce`).
    func exchangeCode(_ code: String, verifier: String) async throws -> SupabaseTokenResponse {
        try await tokenRequest(grant: "pkce", body: ["auth_code": code, "code_verifier": verifier])
    }

    /// Trade a refresh token for a fresh session (`grant_type=refresh_token`).
    func refresh(refreshToken: String) async throws -> SupabaseTokenResponse {
        try await tokenRequest(grant: "refresh_token", body: ["refresh_token": refreshToken])
    }

    private func tokenRequest(grant: String, body: [String: String]) async throws -> SupabaseTokenResponse {
        guard var comps = URLComponents(
            url: config.authRoot.appendingPathComponent("token"),
            resolvingAgainstBaseURL: false
        ) else {
            throw SupabaseAuthError.malformedURL
        }
        comps.queryItems = [URLQueryItem(name: "grant_type", value: grant)]
        guard let url = comps.url else { throw SupabaseAuthError.malformedURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(config.anonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw SupabaseAuthError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw SupabaseAuthError.badResponse(status: -1, body: "")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw SupabaseAuthError.badResponse(
                status: http.statusCode,
                body: String(decoding: data, as: UTF8.self)
            )
        }
        return try JSONDecoder().decode(SupabaseTokenResponse.self, from: data)
    }
}
