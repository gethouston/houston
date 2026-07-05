import CryptoKit
import Foundation

/// RFC 7636 PKCE (S256) primitives for the Supabase OAuth flow.
///
/// Mirrors supabase-js's `getCodeChallengeAndMethod`
/// (`@supabase/auth-js/src/lib/helpers.ts`): a random verifier from the
/// unreserved character set, a challenge = `base64url(SHA256(verifier))`, and
/// the **lowercase** `s256` method string Supabase's GoTrue endpoint issues and
/// verifies against (NOT the RFC's canonical uppercase `S256`).
enum PKCE {
    /// The `code_challenge_method` value sent on the authorize URL. Supabase
    /// GoTrue emits `s256` (lowercase); we match it exactly.
    static let challengeMethod = "s256"

    /// RFC 7636 §4.1 unreserved set: ALPHA / DIGIT / "-" / "." / "_" / "~".
    /// Exactly 64 characters, so `UInt8 % 64` is bias-free (256 = 4 × 64).
    private static let unreserved = Array(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )

    /// A fresh code verifier: `length` random unreserved characters.
    /// RFC 7636 requires 43...128 chars; defaults to 56 to match supabase-js.
    static func makeCodeVerifier(length: Int = 56) -> String {
        precondition((43...128).contains(length), "PKCE verifier must be 43...128 chars")
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        precondition(status == errSecSuccess, "SecRandomCopyBytes failed: \(status)")
        var out = String()
        out.reserveCapacity(length)
        for byte in bytes {
            out.append(unreserved[Int(byte) % unreserved.count])
        }
        return out
    }

    /// The S256 challenge for a verifier: `base64url(SHA256(verifier))`, unpadded.
    static func challenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return base64URLEncode(Data(digest))
    }

    /// Base64url without padding (RFC 4648 §5) — the same transform supabase-js
    /// applies (`+`→`-`, `/`→`_`, strip trailing `=`).
    static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
