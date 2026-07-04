import Foundation

/// The token payload GoTrue returns from `/auth/v1/token` — both the PKCE
/// exchange (`grant_type=pkce`) and refresh (`grant_type=refresh_token`).
/// Decoded tolerantly: unknown JSON fields are ignored.
struct SupabaseTokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int?
    let expiresAt: Int?
    let tokenType: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case expiresAt = "expires_at"
        case tokenType = "token_type"
    }
}

/// A persisted Houston session: the tokens plus the absolute access-token
/// expiry, resolved once at receipt so refresh scheduling never depends on a
/// clock-relative field surviving a restart. Stored as JSON in the Keychain.
struct AuthSession: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    /// Absolute access-token expiry.
    var expiresAt: Date

    init(accessToken: String, refreshToken: String, expiresAt: Date) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
    }

    /// Build from a fresh token response. Prefers GoTrue's absolute `expires_at`
    /// (unix seconds); falls back to `now + expires_in`; and finally to a short
    /// TTL so a payload missing both refreshes eagerly rather than never.
    init(from response: SupabaseTokenResponse, now: Date = Date()) {
        accessToken = response.accessToken
        refreshToken = response.refreshToken
        if let at = response.expiresAt {
            expiresAt = Date(timeIntervalSince1970: TimeInterval(at))
        } else if let inSeconds = response.expiresIn {
            expiresAt = now.addingTimeInterval(TimeInterval(inSeconds))
        } else {
            expiresAt = now.addingTimeInterval(3600)
        }
    }

    /// True when the access token is within `margin` of expiry (or already past).
    func isExpiring(within margin: TimeInterval, now: Date = Date()) -> Bool {
        now.addingTimeInterval(margin) >= expiresAt
    }
}
