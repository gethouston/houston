import XCTest
@testable import Houston

final class AuthCallbackTests: XCTestCase {
    private func url(_ string: String) -> URL {
        guard let url = URL(string: string) else {
            fatalError("bad test URL: \(string)")
        }
        return url
    }

    func testParsesCodeFromCustomSchemeCallback() {
        let result = AuthCallback.parse(url("houston://auth-callback?code=abc123"))
        XCTAssertEqual(result, .code("abc123", state: nil))
    }

    func testCodeCarriesEchoedState() {
        let result = AuthCallback.parse(
            url("houston://auth-callback?code=xyz&state=foo&extra=1")
        )
        XCTAssertEqual(result, .code("xyz", state: "foo"))
    }

    func testParsesErrorWithDescription() {
        let result = AuthCallback.parse(
            url("houston://auth-callback?error=access_denied&error_description=User%20denied")
        )
        XCTAssertEqual(result, .error(code: "access_denied", description: "User denied"))
    }

    func testParsesErrorWithoutDescription() {
        let result = AuthCallback.parse(url("houston://auth-callback?error=server_error"))
        XCTAssertEqual(result, .error(code: "server_error", description: nil))
    }

    func testParsesErrorDeliveredInFragment() {
        let result = AuthCallback.parse(
            url("houston://auth-callback#error=invalid_request&error_description=bad")
        )
        XCTAssertEqual(result, .error(code: "invalid_request", description: "bad"))
    }

    func testEmptyCodeIsNotTreatedAsSuccess() {
        XCTAssertNil(AuthCallback.parse(url("houston://auth-callback?code=")))
    }

    func testNoRecognizedParamsReturnsNil() {
        XCTAssertNil(AuthCallback.parse(url("houston://auth-callback")))
    }
}
