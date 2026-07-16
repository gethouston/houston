import Foundation

/// The signed-in user's identity, as shown in the Settings › Account row
/// (PARITY-SETTINGS §1: provider avatar, display name, email).
///
/// SEAM — where this comes from: the GCIP `AuthSession` already carries the
/// profile (`displayName` / `photoUrl` / `email`, extracted by GCIP from the
/// provider credential, or decoded from the ID token's claims on the email-code
/// path), so this is a pure projection — no JWT decoding and no `/user`
/// round-trip. The view falls back to `settings:account.fallbackName`
/// ("Signed in") when the session carries no name and no email.
struct UserProfile: Equatable, Sendable {
    var avatarURL: URL?
    var fullName: String?
    var email: String?

    init(session: AuthSession) {
        avatarURL = session.photoUrl.flatMap(URL.init(string:))
        fullName = session.displayName
        email = session.email.isEmpty ? nil : session.email
    }

    init(avatarURL: URL? = nil, fullName: String? = nil, email: String? = nil) {
        self.avatarURL = avatarURL
        self.fullName = fullName
        self.email = email
    }

    /// The display name shown next to the avatar: the provider name, then the
    /// email. `nil` only when the session carries neither.
    var displayName: String? {
        if let fullName, !fullName.isEmpty { return fullName }
        if let email, !email.isEmpty { return email }
        return nil
    }
}
