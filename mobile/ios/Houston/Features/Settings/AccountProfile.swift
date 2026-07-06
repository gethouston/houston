import Foundation

/// The signed-in user's identity, as shown in the Settings › Account row
/// (PARITY-SETTINGS §1: avatar from `user_metadata.avatar_url`, name via the
/// `full_name → name → email` fallback chain, plus the email).
///
/// SEAM — where this comes from: the iOS auth layer (`Core/Auth`) exposes only
/// the Supabase session's `accessToken` (a JWT); there is no separate user
/// object. Supabase mints that JWT with the user's `email` and `user_metadata`
/// as claims, so we decode them here rather than adding a `/user` round-trip.
/// The decode is pure and total (a malformed token yields `nil`, never a crash).
struct UserProfile: Equatable, Sendable {
    var avatarURL: URL?
    var fullName: String?
    var name: String?
    var email: String?

    /// The display name shown next to the avatar: `full_name`, then `name`, then
    /// `email`. `nil` only when the token carries none of the three (the view
    /// then falls back to `settings:account.fallbackName` = "Signed in").
    var displayName: String? {
        Self.firstNonEmpty(fullName, name, email)
    }

    /// Decode a Supabase access-token JWT's payload into a profile. Returns `nil`
    /// for a missing/malformed token (fewer than three segments, non-base64url
    /// payload, or non-object JSON) — the caller renders the signed-in fallback.
    static func decode(jwt: String?) -> UserProfile? {
        guard let jwt else { return nil }
        let segments = jwt.split(separator: ".", omittingEmptySubsequences: false)
        guard segments.count >= 2, let payload = base64urlDecode(String(segments[1])) else {
            return nil
        }
        guard
            let root = try? JSONSerialization.jsonObject(with: payload),
            let claims = root as? [String: Any]
        else { return nil }

        let metadata = claims["user_metadata"] as? [String: Any] ?? [:]
        let email = string(claims["email"]) ?? string(metadata["email"])
        let avatar = string(metadata["avatar_url"]) ?? string(metadata["picture"])
        return UserProfile(
            avatarURL: avatar.flatMap(URL.init(string:)),
            fullName: string(metadata["full_name"]),
            name: string(metadata["name"]),
            email: email
        )
    }

    // MARK: - Helpers

    /// The first non-empty string among the candidates, or `nil`.
    static func firstNonEmpty(_ candidates: String?...) -> String? {
        candidates.compactMap { $0 }.first { !$0.isEmpty }
    }

    /// A non-empty `String` off an untyped JSON value, else `nil`.
    private static func string(_ value: Any?) -> String? {
        guard let s = value as? String, !s.isEmpty else { return nil }
        return s
    }

    /// Decode one base64url segment (JWT segments are unpadded base64url).
    private static func base64urlDecode(_ segment: String) -> Data? {
        var s = segment.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = s.count % 4
        if remainder > 0 { s += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: s)
    }
}
