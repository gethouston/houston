import XCTest

@testable import Houston

/// Decode-only ID-token claims parsing (the email-code path's identity
/// source). Shape-tolerant: malformed input → nil, never a crash.
final class IdTokenClaimsTests: XCTestCase {
    private func jwt(_ claims: [String: Any]) -> String {
        let data = try! JSONSerialization.data(withJSONObject: claims)
        let payload = data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "header.\(payload).signature"
    }

    func testDecodesFullClaimSet() throws {
        let claims = try XCTUnwrap(IdTokenClaims.decode(jwt([
            "sub": "uid-1", "email": "a@b.com", "email_verified": true,
            "name": "Juan", "picture": "https://cdn/p.png",
            "firebase": ["sign_in_provider": "google.com"], "exp": 1_900_000_000,
        ])))
        XCTAssertEqual(claims.sub, "uid-1")
        XCTAssertEqual(claims.email, "a@b.com")
        XCTAssertTrue(claims.emailVerified)
        XCTAssertEqual(claims.name, "Juan")
        XCTAssertEqual(claims.picture, "https://cdn/p.png")
        XCTAssertEqual(claims.signInProvider, "google.com")
        XCTAssertEqual(claims.exp, 1_900_000_000)
    }

    func testMinimalClaimsDefaultSensibly() throws {
        let claims = try XCTUnwrap(IdTokenClaims.decode(jwt(["sub": "u"])))
        XCTAssertNil(claims.email)
        XCTAssertFalse(claims.emailVerified)
        XCTAssertNil(claims.name)
        XCTAssertNil(claims.signInProvider)
        XCTAssertNil(claims.exp)
    }

    func testMalformedTokensReturnNil() {
        XCTAssertNil(IdTokenClaims.decode(""))
        XCTAssertNil(IdTokenClaims.decode("onlyonesegment"))
        XCTAssertNil(IdTokenClaims.decode("header.!!!notbase64!!!.sig"))
        // Valid payload but no string `sub`.
        XCTAssertNil(IdTokenClaims.decode(jwt(["email": "a@b.com"])))
        // Empty `sub` is invalid too.
        XCTAssertNil(IdTokenClaims.decode(jwt(["sub": ""])))
    }
}
