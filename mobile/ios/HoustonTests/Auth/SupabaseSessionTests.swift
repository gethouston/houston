import XCTest
@testable import Houston

final class SupabaseSessionTests: XCTestCase {
    private func decode(_ json: String) throws -> SupabaseTokenResponse {
        try JSONDecoder().decode(SupabaseTokenResponse.self, from: Data(json.utf8))
    }

    func testDecodesTokenResponseTolerantly() throws {
        let response = try decode("""
        { "access_token": "at", "refresh_token": "rt", "expires_in": 3600,
          "expires_at": 1751000000, "token_type": "bearer",
          "unknown_future_field": true }
        """)
        XCTAssertEqual(response.accessToken, "at")
        XCTAssertEqual(response.refreshToken, "rt")
        XCTAssertEqual(response.expiresAt, 1751000000)
    }

    func testSessionPrefersAbsoluteExpiresAt() throws {
        let response = try decode("""
        { "access_token": "at", "refresh_token": "rt", "expires_in": 3600,
          "expires_at": 1751000000 }
        """)
        let session = AuthSession(from: response, now: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(session.expiresAt, Date(timeIntervalSince1970: 1751000000))
    }

    func testSessionFallsBackToExpiresIn() throws {
        let response = try decode("""
        { "access_token": "at", "refresh_token": "rt", "expires_in": 3600 }
        """)
        let now = Date(timeIntervalSince1970: 1_000_000)
        let session = AuthSession(from: response, now: now)
        XCTAssertEqual(session.expiresAt, now.addingTimeInterval(3600))
    }

    func testIsExpiringWithinMargin() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let session = AuthSession(
            accessToken: "at",
            refreshToken: "rt",
            expiresAt: now.addingTimeInterval(30)
        )
        // 30s to expiry, 60s margin -> expiring.
        XCTAssertTrue(session.isExpiring(within: 60, now: now))
        // 30s to expiry, 10s margin -> not yet.
        XCTAssertFalse(session.isExpiring(within: 10, now: now))
    }

    func testRoundTripsThroughCodable() throws {
        let session = AuthSession(
            accessToken: "at",
            refreshToken: "rt",
            expiresAt: Date(timeIntervalSince1970: 1751000000)
        )
        let data = try JSONEncoder().encode(session)
        let decoded = try JSONDecoder().decode(AuthSession.self, from: data)
        XCTAssertEqual(decoded, session)
    }
}
