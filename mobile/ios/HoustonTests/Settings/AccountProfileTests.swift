import Foundation
import XCTest

@testable import Houston

/// The account identity decode (PARITY-SETTINGS §1): the display-name fallback
/// chain `full_name → name → email`, avatar extraction, and total tolerance of a
/// malformed JWT (never a crash).
final class AccountProfileTests: XCTestCase {
    /// Build a JWT whose payload segment encodes `claims` (header/signature are
    /// inert — only the middle segment is decoded).
    private func jwt(_ claims: [String: Any]) -> String {
        let data = try! JSONSerialization.data(withJSONObject: claims)
        let payload = data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "header.\(payload).signature"
    }

    // MARK: Display-name fallback chain

    func testDisplayNamePrefersFullName() {
        let profile = UserProfile.decode(jwt: jwt([
            "email": "juan@example.com",
            "user_metadata": ["full_name": "Juan Perez", "name": "jperez"],
        ]))
        XCTAssertEqual(profile?.displayName, "Juan Perez")
    }

    func testDisplayNameFallsBackToNameThenEmail() {
        let onlyName = UserProfile.decode(jwt: jwt([
            "email": "a@b.com", "user_metadata": ["name": "handle"],
        ]))
        XCTAssertEqual(onlyName?.displayName, "handle")

        let onlyEmail = UserProfile.decode(jwt: jwt([
            "email": "a@b.com", "user_metadata": [String: Any](),
        ]))
        XCTAssertEqual(onlyEmail?.displayName, "a@b.com")
    }

    func testEmptyStringsAreSkippedInChain() {
        let profile = UserProfile.decode(jwt: jwt([
            "email": "a@b.com",
            "user_metadata": ["full_name": "", "name": "Real Name"],
        ]))
        XCTAssertEqual(profile?.displayName, "Real Name")
    }

    func testDisplayNameNilWhenNothingPresent() {
        let profile = UserProfile.decode(jwt: jwt(["sub": "123"]))
        XCTAssertNil(profile?.displayName)
        XCTAssertNil(profile?.email)
    }

    // MARK: Avatar + email

    func testAvatarPrefersAvatarUrlThenPicture() {
        let avatar = UserProfile.decode(jwt: jwt([
            "user_metadata": ["avatar_url": "https://cdn/x.png", "picture": "https://cdn/y.png"],
        ]))
        XCTAssertEqual(avatar?.avatarURL?.absoluteString, "https://cdn/x.png")

        let picture = UserProfile.decode(jwt: jwt([
            "user_metadata": ["picture": "https://cdn/y.png"],
        ]))
        XCTAssertEqual(picture?.avatarURL?.absoluteString, "https://cdn/y.png")
    }

    func testEmailFromTopLevelClaimOrMetadata() {
        let topLevel = UserProfile.decode(jwt: jwt(["email": "top@b.com"]))
        XCTAssertEqual(topLevel?.email, "top@b.com")

        let fromMetadata = UserProfile.decode(jwt: jwt([
            "user_metadata": ["email": "meta@b.com"],
        ]))
        XCTAssertEqual(fromMetadata?.email, "meta@b.com")
    }

    // MARK: Malformed input → nil, never a crash

    func testMalformedTokensReturnNil() {
        XCTAssertNil(UserProfile.decode(jwt: nil))
        XCTAssertNil(UserProfile.decode(jwt: ""))
        XCTAssertNil(UserProfile.decode(jwt: "onlyonesegment"))
        XCTAssertNil(UserProfile.decode(jwt: "header.!!!notbase64!!!.sig"))
        // Valid base64url payload that isn't a JSON object → nil.
        XCTAssertNil(UserProfile.decode(jwt: "header.WyJhIl0.sig"))  // base64url of `["a"]`
    }
}
