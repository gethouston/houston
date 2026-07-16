import XCTest

@testable import Houston

final class FirebaseSessionTests: XCTestCase {
    private func idp(displayName: String? = "Provider Name") -> GcipIdpResult {
        GcipIdpResult(
            idToken: "id", refreshToken: "rt",
            expiresAt: Date(timeIntervalSince1970: 2_000_000_000),
            uid: "uid-1", email: "a@b.com", emailVerified: true,
            displayName: displayName, photoUrl: "https://cdn/p.png")
    }

    /// A JWT whose payload encodes `claims` (header/signature are inert).
    private func jwt(_ claims: [String: Any]) -> String {
        let data = try! JSONSerialization.data(withJSONObject: claims)
        let payload = data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "header.\(payload).signature"
    }

    func testBuildsFromIdpResult() {
        let session = AuthSession(idp: idp(), provider: .google)
        XCTAssertEqual(session.uid, "uid-1")
        XCTAssertEqual(session.provider, .google)
        XCTAssertEqual(session.displayName, "Provider Name")
        XCTAssertEqual(session.photoUrl, "https://cdn/p.png")
    }

    func testAppleFallbackNameUsedOnlyWhenGcipHasNone() {
        let withGcipName = AuthSession(idp: idp(), provider: .apple, fallbackDisplayName: "From Apple")
        XCTAssertEqual(withGcipName.displayName, "Provider Name")

        let withoutGcipName = AuthSession(idp: idp(displayName: nil), provider: .apple, fallbackDisplayName: "From Apple")
        XCTAssertEqual(withoutGcipName.displayName, "From Apple")
    }

    func testBuildsFromCustomTokenExchangeViaClaims() throws {
        let token = jwt([
            "sub": "uid-9", "email": "otp@b.com", "email_verified": true,
            "firebase": ["sign_in_provider": "custom"],
        ])
        let tokens = GcipTokens(
            idToken: token, refreshToken: "rt",
            expiresAt: Date(timeIntervalSince1970: 2_000_000_000))
        let session = try XCTUnwrap(AuthSession(tokens: tokens))
        XCTAssertEqual(session.uid, "uid-9")
        XCTAssertEqual(session.email, "otp@b.com")
        XCTAssertEqual(session.provider, .custom)
    }

    func testCustomTokenSessionNilOnMalformedToken() {
        let tokens = GcipTokens(idToken: "not-a-jwt", refreshToken: "rt", expiresAt: Date())
        XCTAssertNil(AuthSession(tokens: tokens))
    }

    func testRefreshedKeepsProfileAndSwapsTokens() {
        let original = AuthSession(idp: idp(), provider: .microsoft)
        let refreshed = original.refreshed(with: GcipTokens(
            idToken: "new-id", refreshToken: "new-rt",
            expiresAt: Date(timeIntervalSince1970: 2_100_000_000)))
        XCTAssertEqual(refreshed.idToken, "new-id")
        XCTAssertEqual(refreshed.refreshToken, "new-rt")
        XCTAssertEqual(refreshed.uid, original.uid)
        XCTAssertEqual(refreshed.displayName, original.displayName)
        XCTAssertEqual(refreshed.provider, .microsoft)
    }

    func testIsExpiringWithinMargin() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        var session = AuthSession(idp: idp(), provider: .google)
        session.expiresAt = now.addingTimeInterval(30)
        XCTAssertTrue(session.isExpiring(within: 60, now: now))
        XCTAssertFalse(session.isExpiring(within: 10, now: now))
    }

    func testRoundTripsThroughCodable() throws {
        let session = AuthSession(idp: idp(), provider: .apple)
        let data = try JSONEncoder().encode(session)
        let decoded = try JSONDecoder().decode(AuthSession.self, from: data)
        XCTAssertEqual(decoded, session)
    }

    func testLegacySupabaseBlobDoesNotDecode() {
        // The exact shape the pre-Firebase app persisted under the same
        // Keychain key. It must FAIL to decode (the keychain then discards it).
        let legacy = Data(#"{"accessToken":"at","refreshToken":"rt","expiresAt":773094113.0}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(AuthSession.self, from: legacy))
    }
}
