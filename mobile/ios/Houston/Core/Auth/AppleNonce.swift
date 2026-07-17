import CryptoKit
import Foundation

/// Nonce material for native Sign in with Apple (replay protection).
///
/// The raw nonce travels two ways: its SHA-256 **hex digest** goes to Apple on
/// the `ASAuthorizationAppleIDRequest` (Apple embeds it in the identity
/// token's `nonce` claim), and the **raw** value goes to GCIP's
/// `signInWithIdp` `postBody`, which re-hashes and compares. A mismatch fails
/// with MISSING_OR_INVALID_NONCE (`invalid_idp_response`).
enum AppleNonce {
    /// A fresh raw nonce — random characters from the PKCE unreserved set.
    static func random() -> String {
        PKCE.makeCodeVerifier(length: 43)
    }

    /// Lowercase hex SHA-256 of the raw nonce — the request-side form.
    static func sha256Hex(_ raw: String) -> String {
        SHA256.hash(data: Data(raw.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
