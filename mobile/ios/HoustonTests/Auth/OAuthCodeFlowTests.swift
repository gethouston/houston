import XCTest

@testable import Houston

/// Pins the browser-flow authorize URLs (parameter names, order, escaping) and
/// the provider specs — the iOS counterpart of the desktop loopback flow.
final class OAuthCodeFlowTests: XCTestCase {
    func testGoogleAuthorizeURLBytes() throws {
        let spec = ProviderSpecs.google(clientID: "12345-abc.apps.googleusercontent.com")
        let url = try XCTUnwrap(OAuthCodeFlow.authorizeURL(spec: spec, challenge: "CHAL~1", state: "STATE1"))
        XCTAssertEqual(
            url.absoluteString,
            "https://accounts.google.com/o/oauth2/v2/auth"
                + "?client_id=12345-abc.apps.googleusercontent.com"
                + "&redirect_uri=com.googleusercontent.apps.12345-abc%3A%2Foauth2redirect"
                + "&response_type=code"
                + "&scope=openid%20email%20profile"
                + "&code_challenge=CHAL~1"
                + "&code_challenge_method=S256"
                + "&state=STATE1"
        )
    }

    func testMicrosoftAuthorizeURLIncludesSelectAccountPrompt() throws {
        let spec = ProviderSpecs.microsoft(clientID: "entra-app-id")
        let url = try XCTUnwrap(OAuthCodeFlow.authorizeURL(spec: spec, challenge: "C", state: "S"))
        XCTAssertEqual(
            url.absoluteString,
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
                + "?client_id=entra-app-id"
                + "&redirect_uri=houston%3A%2F%2Fauth-callback"
                + "&response_type=code"
                + "&scope=openid%20email%20profile"
                + "&code_challenge=C"
                + "&code_challenge_method=S256"
                + "&state=S"
                + "&prompt=select_account"
        )
    }

    func testGoogleReversedScheme() {
        XCTAssertEqual(
            ProviderSpecs.reversedGoogleScheme(clientID: "12345-abc.apps.googleusercontent.com"),
            "com.googleusercontent.apps.12345-abc")
        // Not an iOS-shaped client id → empty (flow fails on the client check).
        XCTAssertEqual(ProviderSpecs.reversedGoogleScheme(clientID: "whatever"), "")
        XCTAssertEqual(ProviderSpecs.reversedGoogleScheme(clientID: ""), "")
    }

    @MainActor
    func testMissingClientIDFailsLoudlyBeforeOpeningBrowser() async {
        let flow = OAuthCodeFlow(spec: ProviderSpecs.google(clientID: ""))
        do {
            _ = try await flow.run(web: WebAuthSession())
            XCTFail("expected operationNotAllowed")
        } catch {
            XCTAssertEqual((error as? IdentityError)?.code, .operationNotAllowed)
            XCTAssertEqual((error as? IdentityError)?.rawCode, "client_id_missing")
        }
    }

    func testAppleNonceHexDigest() {
        // SHA-256("abc") — canonical NIST vector, lowercase hex.
        XCTAssertEqual(
            AppleNonce.sha256Hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(AppleNonce.random().count, 43)
        XCTAssertNotEqual(AppleNonce.random(), AppleNonce.random())
    }
}
