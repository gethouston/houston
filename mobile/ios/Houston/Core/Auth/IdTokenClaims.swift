import Foundation
import os

private let claimsLog = Logger(subsystem: "ai.gethouston.app", category: "auth")

/// Decode a Firebase ID token's claims WITHOUT verifying its signature — the
/// Swift mirror of the desktop's `identity/id-token.ts`. The client never
/// verifies (the gateway does, against Google's JWKS); we only read claims the
/// REST response omits: `accounts:signInWithCustomToken` (the email-OTP path)
/// returns an idToken + refreshToken but NO uid/email, so the session is
/// assembled from `sub` / `email` / `email_verified` / `name` / `picture`.
///
/// Decode-only and shape-tolerant: a malformed token yields `nil` plus a
/// structured log, never a throw.
struct IdTokenClaims: Equatable, Sendable {
    /// Firebase UID.
    let sub: String
    let email: String?
    let emailVerified: Bool
    let name: String?
    /// Provider avatar URL, when the token carries one.
    let picture: String?
    /// `firebase.sign_in_provider`, e.g. "custom", "google.com", "apple.com".
    let signInProvider: String?
    /// Expiry, epoch SECONDS (JWT convention). `nil` when absent/malformed.
    let exp: TimeInterval?

    /// Decode (not verify) an ID token's payload. Returns `nil` if malformed.
    static func decode(_ idToken: String) -> IdTokenClaims? {
        let segments = idToken.split(separator: ".", omittingEmptySubsequences: false)
        guard segments.count >= 2, let payload = base64URLDecode(String(segments[1])) else {
            claimsLog.warning("ID token has no decodable payload segment, cannot decode claims")
            return nil
        }
        guard
            let root = try? JSONSerialization.jsonObject(with: payload),
            let claims = root as? [String: Any],
            let sub = claims["sub"] as? String, !sub.isEmpty
        else {
            claimsLog.warning("ID token claims missing a string `sub`, treating as invalid")
            return nil
        }
        let firebase = claims["firebase"] as? [String: Any]
        return IdTokenClaims(
            sub: sub,
            email: nonEmptyString(claims["email"]),
            emailVerified: claims["email_verified"] as? Bool ?? false,
            name: nonEmptyString(claims["name"]),
            picture: nonEmptyString(claims["picture"]),
            signInProvider: nonEmptyString(firebase?["sign_in_provider"]),
            exp: (claims["exp"] as? NSNumber)?.doubleValue
        )
    }

    /// Decode one base64url segment (JWT segments are unpadded base64url).
    static func base64URLDecode(_ segment: String) -> Data? {
        var s = segment
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = s.count % 4
        if remainder > 0 { s += String(repeating: "=", count: 4 - remainder) }
        return Data(base64Encoded: s)
    }

    private static func nonEmptyString(_ value: Any?) -> String? {
        guard let s = value as? String, !s.isEmpty else { return nil }
        return s
    }
}
