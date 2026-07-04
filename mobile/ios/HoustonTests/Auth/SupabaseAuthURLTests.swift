import XCTest
@testable import Houston

final class SupabaseAuthURLTests: XCTestCase {
    private let config = SupabaseAuthConfig(
        baseURL: URL(string: "https://zfpnlvxazrataiannvtq.supabase.co")!,
        anonKey: "anon-key",
        redirectURL: "houston://auth-callback"
    )

    private func queryItems(_ url: URL) -> [String: String] {
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        var out: [String: String] = [:]
        for item in comps?.queryItems ?? [] { out[item.name] = item.value }
        return out
    }

    func testAuthRootPath() {
        XCTAssertEqual(
            config.authRoot.absoluteString,
            "https://zfpnlvxazrataiannvtq.supabase.co/auth/v1"
        )
    }

    func testCallbackSchemeDerivedFromRedirect() {
        XCTAssertEqual(config.callbackScheme, "houston")
    }

    func testAuthorizeURLEndpointAndParams() {
        let url = SupabaseAuth.authorizeURL(
            config: config,
            provider: "google",
            challenge: "CHALLENGE123"
        )
        let unwrapped = try? XCTUnwrap(url)
        XCTAssertTrue(
            unwrapped?.absoluteString.hasPrefix(
                "https://zfpnlvxazrataiannvtq.supabase.co/auth/v1/authorize?"
            ) ?? false
        )
        let items = queryItems(unwrapped ?? URL(string: "about:blank")!)
        XCTAssertEqual(items["provider"], "google")
        XCTAssertEqual(items["redirect_to"], "houston://auth-callback")
        XCTAssertEqual(items["code_challenge"], "CHALLENGE123")
        XCTAssertEqual(items["code_challenge_method"], "s256")
    }

    func testAuthorizeURLHasNoFlowTypeParam() {
        // supabase-js does NOT append `flow_type` to the authorize URL; the
        // flow is implied by `code_challenge`. Guard against re-adding it.
        let url = SupabaseAuth.authorizeURL(
            config: config, provider: "google", challenge: "c"
        )
        XCTAssertNil(queryItems(url!)["flow_type"])
    }

    func testRedirectIsPercentEncodedInRawURL() {
        let url = SupabaseAuth.authorizeURL(
            config: config, provider: "google", challenge: "c"
        )!
        // The custom-scheme redirect must be percent-encoded in the raw string.
        XCTAssertTrue(url.absoluteString.contains("redirect_to=houston%3A%2F%2Fauth-callback"))
    }
}
