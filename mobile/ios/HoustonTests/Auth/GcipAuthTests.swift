import XCTest

@testable import Houston

/// Pins the GCIP wire shapes to the desktop implementation
/// (`app/src/lib/identity/firebase-rest.ts`) — the two clients must send
/// byte-identical credential payloads and read the same response fields.
final class GcipAuthTests: XCTestCase {
    // MARK: idpPostBody — the URLSearchParams-encoded credential

    func testIdpPostBodyWithoutNonce() {
        let body = GcipAuth.idpPostBody(
            providerId: "google.com", idToken: "abc.def.ghi", rawNonce: nil)
        XCTAssertEqual(body, "providerId=google.com&id_token=abc.def.ghi")
    }

    func testIdpPostBodyWithNonceForApple() {
        let body = GcipAuth.idpPostBody(
            providerId: "apple.com", idToken: "t", rawNonce: "raw-nonce~x")
        XCTAssertEqual(body, "providerId=apple.com&id_token=t&nonce=raw-nonce~x")
    }

    func testFormEncodeEscapesLikeEncodeURIComponent() {
        // `:` `/` `=` `&` `+` must escape; the unreserved set must not.
        let encoded = GcipAuth.formEncode([("k", "a:/b=c&d+e"), ("u", "A-z0.9_!~*'()")])
        XCTAssertEqual(encoded, "k=a%3A%2Fb%3Dc%26d%2Be&u=A-z0.9_!~*'()")
    }

    // MARK: tokens(from:) — expiresIn seconds-string → absolute expiry

    func testTokensParsesCamelCaseShape() throws {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let tokens = try GcipAuth.tokens(
            from: ["idToken": "id", "refreshToken": "rt", "expiresIn": "3600"],
            idTokenKey: "idToken", refreshKey: "refreshToken", expiresKey: "expiresIn",
            now: now)
        XCTAssertEqual(tokens.idToken, "id")
        XCTAssertEqual(tokens.refreshToken, "rt")
        XCTAssertEqual(tokens.expiresAt, now.addingTimeInterval(3600))
    }

    func testTokensParsesSecureTokenSnakeCaseShape() throws {
        let now = Date(timeIntervalSince1970: 5)
        let tokens = try GcipAuth.tokens(
            from: ["id_token": "id2", "refresh_token": "rt2", "expires_in": "60"],
            idTokenKey: "id_token", refreshKey: "refresh_token", expiresKey: "expires_in",
            now: now)
        XCTAssertEqual(tokens.refreshToken, "rt2")
        XCTAssertEqual(tokens.expiresAt, now.addingTimeInterval(60))
    }

    func testTokensRejectsMissingOrMalformedFields() {
        // Missing refresh token.
        XCTAssertThrowsError(try GcipAuth.tokens(
            from: ["idToken": "id", "expiresIn": "3600"],
            idTokenKey: "idToken", refreshKey: "refreshToken", expiresKey: "expiresIn")
        ) { error in
            XCTAssertEqual((error as? IdentityError)?.code, .malformedResponse)
        }
        // Non-numeric expiry string.
        XCTAssertThrowsError(try GcipAuth.tokens(
            from: ["idToken": "id", "refreshToken": "rt", "expiresIn": "soon"],
            idTokenKey: "idToken", refreshKey: "refreshToken", expiresKey: "expiresIn"))
    }

    // MARK: GCIP error-message mapping (mirror of errors.ts GCIP_CODE_MAP)

    func testMapsCodeWithDetailSuffix() {
        let error = IdentityError.fromGcipMessage(
            "INVALID_LOGIN_CREDENTIALS : Something human.", httpStatus: 400)
        XCTAssertEqual(error.code, .invalidCredentials)
        XCTAssertEqual(error.rawCode, "INVALID_LOGIN_CREDENTIALS")
    }

    func testMapsNonceAndProviderAndRefreshCodes() {
        XCTAssertEqual(IdentityError.fromGcipMessage("MISSING_OR_INVALID_NONCE", httpStatus: 400).code, .invalidIdpResponse)
        XCTAssertEqual(IdentityError.fromGcipMessage("OPERATION_NOT_ALLOWED", httpStatus: 400).code, .operationNotAllowed)
        XCTAssertEqual(IdentityError.fromGcipMessage("INVALID_REFRESH_TOKEN", httpStatus: 400).code, .invalidRefreshToken)
        XCTAssertEqual(IdentityError.fromGcipMessage("TOO_MANY_ATTEMPTS_TRY_LATER", httpStatus: 400).code, .tooManyAttempts)
    }

    func testMapsApiKeyProseAndUnknown() {
        XCTAssertEqual(
            IdentityError.fromGcipMessage(
                "API key not valid. Please pass a valid API key.", httpStatus: 400).code,
            .apiKeyInvalid)
        let unknown = IdentityError.fromGcipMessage("SOME_FUTURE_CODE", httpStatus: 400)
        XCTAssertEqual(unknown.code, .unknown)
        XCTAssertEqual(unknown.rawCode, "SOME_FUTURE_CODE")
    }
}
