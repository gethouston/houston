import Foundation
import XCTest

@testable import Houston

/// The account identity projection (PARITY-SETTINGS §1): `UserProfile` is a
/// pure view over the GCIP `AuthSession` — display-name fallback chain
/// `displayName → email`, avatar extraction, empty-email normalization.
final class AccountProfileTests: XCTestCase {
    private func session(
        displayName: String? = nil,
        photoUrl: String? = nil,
        email: String = ""
    ) -> AuthSession {
        AuthSession(
            idToken: "id", refreshToken: "rt", uid: "uid-1", email: email,
            emailVerified: true, displayName: displayName, photoUrl: photoUrl,
            provider: .google, expiresAt: Date(timeIntervalSince1970: 2_000_000_000)
        )
    }

    func testDisplayNamePrefersProviderName() {
        let profile = UserProfile(session: session(displayName: "Juan Perez", email: "juan@example.com"))
        XCTAssertEqual(profile.displayName, "Juan Perez")
    }

    func testDisplayNameFallsBackToEmail() {
        let profile = UserProfile(session: session(email: "a@b.com"))
        XCTAssertEqual(profile.displayName, "a@b.com")
    }

    func testDisplayNameNilWhenNothingPresent() {
        let profile = UserProfile(session: session())
        XCTAssertNil(profile.displayName)
        XCTAssertNil(profile.email, "empty session email must normalize to nil")
    }

    func testAvatarParsesPhotoUrl() {
        let profile = UserProfile(session: session(photoUrl: "https://cdn/x.png"))
        XCTAssertEqual(profile.avatarURL?.absoluteString, "https://cdn/x.png")
        XCTAssertNil(UserProfile(session: session()).avatarURL)
    }
}
