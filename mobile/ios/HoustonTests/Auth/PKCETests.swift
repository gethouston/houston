import XCTest
@testable import Houston

final class PKCETests: XCTestCase {
    /// RFC 7636 Appendix B canonical test vector. If `challenge(for:)` ever
    /// stops matching this, the S256 transform is broken and every sign-in
    /// would fail at the token exchange with `bad_code_verifier`.
    func testRFC7636AppendixBVector() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        let expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        XCTAssertEqual(PKCE.challenge(for: verifier), expected)
    }

    func testChallengeMethodIsCanonicalS256() {
        // RFC 7636 §4.3 canonical form — Google and Entra both require it.
        XCTAssertEqual(PKCE.challengeMethod, "S256")
    }

    func testVerifierLengthAndAlphabet() {
        let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        for length in [43, 56, 128] {
            let verifier = PKCE.makeCodeVerifier(length: length)
            XCTAssertEqual(verifier.count, length)
            XCTAssertTrue(verifier.allSatisfy { allowed.contains($0) },
                          "verifier contains a non-unreserved character")
        }
    }

    func testVerifiersAreUnique() {
        let a = PKCE.makeCodeVerifier()
        let b = PKCE.makeCodeVerifier()
        XCTAssertNotEqual(a, b)
    }

    func testChallengeIsBase64URLUnpadded() {
        let challenge = PKCE.challenge(for: PKCE.makeCodeVerifier())
        XCTAssertFalse(challenge.contains("+"))
        XCTAssertFalse(challenge.contains("/"))
        XCTAssertFalse(challenge.contains("="))
    }

    func testBase64URLEncodeKnownBytes() {
        // 0xFF 0xFF 0xFF -> standard "////" -> base64url "____", no padding.
        XCTAssertEqual(PKCE.base64URLEncode(Data([0xFF, 0xFF, 0xFF])), "____")
        // 0x00 0x00 -> "AAA=" -> "AAA" (padding stripped).
        XCTAssertEqual(PKCE.base64URLEncode(Data([0x00, 0x00])), "AAA")
    }
}
