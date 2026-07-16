import Foundation

/// Tokens common to every GCIP response: the ID token (gateway bearer), the
/// refresh token, and the absolute expiry resolved at receipt.
struct GcipTokens: Equatable, Sendable {
    let idToken: String
    let refreshToken: String
    let expiresAt: Date
}

/// A federated `signInWithIdp` result — tokens plus the profile GCIP extracted
/// from the provider credential.
struct GcipIdpResult: Equatable, Sendable {
    let idToken: String
    let refreshToken: String
    let expiresAt: Date
    let uid: String
    let email: String
    let emailVerified: Bool
    let displayName: String?
    let photoUrl: String?
}

/// Typed GCIP REST wrappers — the iOS mirror of the desktop's
/// `identity/firebase-rest.ts`. Three calls, all `URLSession`, all throwing
/// typed `IdentityError` on failure:
///
///   signInWithIdp         — federated sign-in (Google / Microsoft / Apple)
///   signInWithCustomToken — email-OTP final exchange (gateway-minted token)
///   refresh               — rehydrate/refresh via securetoken.googleapis.com
///
/// Request building is split into pure static builders so unit tests pin the
/// exact wire shapes against the desktop implementation.
struct GcipAuth {
    static let identityToolkitBase = "https://identitytoolkit.googleapis.com/v1"
    static let secureTokenBase = "https://securetoken.googleapis.com/v1"

    let apiKey: String
    let session: URLSession

    init(apiKey: String, session: URLSession = .shared) {
        self.apiKey = apiKey
        self.session = session
    }

    // MARK: - Pure request builders (unit-tested)

    /// The `postBody` credential string for `signInWithIdp` — the same
    /// URLSearchParams encoding the desktop sends. `rawNonce` is the UNHASHED
    /// nonce for Apple (GCIP re-hashes and compares against the token's claim).
    static func idpPostBody(providerId: String, idToken: String, rawNonce: String?) -> String {
        var pairs = [("providerId", providerId), ("id_token", idToken)]
        if let rawNonce { pairs.append(("nonce", rawNonce)) }
        return formEncode(pairs)
    }

    /// `application/x-www-form-urlencoded` with `encodeURIComponent` escaping —
    /// matches the JS `URLSearchParams` bytes for token-shaped values.
    static func formEncode(_ pairs: [(String, String)]) -> String {
        pairs.map { "\(encodeComponent($0.0))=\(encodeComponent($0.1))" }
            .joined(separator: "&")
    }

    /// `encodeURIComponent` allowed set: alphanumerics plus `-_.!~*'()`.
    static func encodeComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: componentAllowed) ?? value
    }

    private static let componentAllowed: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-_.!~*'()")
        return set
    }()

    // MARK: - Calls

    /// Federated sign-in with an OIDC `idToken` from Google / Microsoft / Apple.
    func signInWithIdp(
        providerId: String, idToken: String, rawNonce: String? = nil
    ) async throws -> GcipIdpResult {
        let body: [String: Any] = [
            "postBody": Self.idpPostBody(providerId: providerId, idToken: idToken, rawNonce: rawNonce),
            "requestUri": "http://localhost",
            "returnSecureToken": true,
            "returnIdpCredential": true,
        ]
        let obj = try await postJSON("\(Self.identityToolkitBase)/accounts:signInWithIdp", json: body)
        let tokens = try Self.tokens(from: obj, idTokenKey: "idToken", refreshKey: "refreshToken", expiresKey: "expiresIn")
        guard let uid = obj["localId"] as? String, !uid.isEmpty else {
            throw IdentityError(.malformedResponse)
        }
        return GcipIdpResult(
            idToken: tokens.idToken,
            refreshToken: tokens.refreshToken,
            expiresAt: tokens.expiresAt,
            uid: uid,
            email: obj["email"] as? String ?? "",
            emailVerified: obj["emailVerified"] as? Bool ?? false,
            displayName: nonEmpty(obj["displayName"]),
            photoUrl: nonEmpty(obj["photoUrl"])
        )
    }

    /// Exchange a gateway-minted custom token (email-OTP flow) for a session.
    func signInWithCustomToken(_ customToken: String) async throws -> GcipTokens {
        let obj = try await postJSON(
            "\(Self.identityToolkitBase)/accounts:signInWithCustomToken",
            json: ["token": customToken, "returnSecureToken": true]
        )
        return try Self.tokens(from: obj, idTokenKey: "idToken", refreshKey: "refreshToken", expiresKey: "expiresIn")
    }

    /// Refresh (or rehydrate across launches) via securetoken. Snake_case body.
    func refresh(refreshToken: String) async throws -> GcipTokens {
        let body = Self.formEncode([
            ("grant_type", "refresh_token"),
            ("refresh_token", refreshToken),
        ])
        let obj = try await post(
            "\(Self.secureTokenBase)/token",
            body: Data(body.utf8),
            contentType: "application/x-www-form-urlencoded"
        )
        return try Self.tokens(from: obj, idTokenKey: "id_token", refreshKey: "refresh_token", expiresKey: "expires_in")
    }

    // MARK: - Shared plumbing

    /// `expiresIn` arrives as a seconds STRING; resolve to an absolute Date.
    static func tokens(
        from obj: [String: Any], idTokenKey: String, refreshKey: String, expiresKey: String,
        now: Date = Date()
    ) throws -> GcipTokens {
        guard
            let idToken = obj[idTokenKey] as? String, !idToken.isEmpty,
            let refresh = obj[refreshKey] as? String, !refresh.isEmpty,
            let expiresRaw = obj[expiresKey] as? String, let seconds = TimeInterval(expiresRaw)
        else { throw IdentityError(.malformedResponse) }
        return GcipTokens(idToken: idToken, refreshToken: refresh, expiresAt: now.addingTimeInterval(seconds))
    }

    private func postJSON(_ endpoint: String, json: [String: Any]) async throws -> [String: Any] {
        let body = try JSONSerialization.data(withJSONObject: json)
        return try await post(endpoint, body: body, contentType: "application/json")
    }

    private func post(_ endpoint: String, body: Data, contentType: String) async throws -> [String: Any] {
        guard let url = URL(string: "\(endpoint)?key=\(Self.encodeComponent(apiKey))") else {
            throw IdentityError(.malformedResponse)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = body

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
            // GCIP error shape: { "error": { "message": "CODE : detail" } }.
            if let message = (obj?["error"] as? [String: Any])?["message"] as? String {
                throw IdentityError.fromGcipMessage(message, httpStatus: http.statusCode)
            }
            throw IdentityError(.unknown, httpStatus: http.statusCode)
        }
        guard let obj else { throw IdentityError(.malformedResponse, httpStatus: http.statusCode) }
        return obj
    }

    private func nonEmpty(_ value: Any?) -> String? {
        guard let s = value as? String, !s.isEmpty else { return nil }
        return s
    }
}
