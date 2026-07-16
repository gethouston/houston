import CryptoKit
import Foundation

/// RFC 7636 PKCE (S256) primitives for the Google / Microsoft OAuth code
/// flows: a random verifier from the unreserved character set, a challenge =
/// `base64url(SHA256(verifier))`, and the canonical `S256` method string.
enum PKCE {
    /// The `code_challenge_method` value sent on the authorize URL (RFC 7636 §4.3).
    static let challengeMethod = "S256"

    /// RFC 7636 §4.1 unreserved set: ALPHA / DIGIT / "-" / "." / "_" / "~".
    /// Exactly 64 characters, so `UInt8 % 64` is bias-free (256 = 4 × 64).
    private static let unreserved = Array(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )

    /// A fresh code verifier: `length` random unreserved characters.
    /// RFC 7636 requires 43...128 chars; 56 matches the desktop flow.
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

    /// Base64url without padding (RFC 4648 §5): `+`→`-`, `/`→`_`, strip `=`.
    static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
