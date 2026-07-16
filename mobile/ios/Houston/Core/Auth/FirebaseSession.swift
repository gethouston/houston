import Foundation

/// How the user authenticated — recorded on the session for analytics + UX.
/// Mirrors the desktop `AuthProvider` union (`identity/session.ts`) plus
/// `apple.com`, which is iOS-first (native Sign in with Apple).
enum AuthProviderID: String, Codable, Equatable, Sendable {
    case google = "google.com"
    case microsoft = "microsoft.com"
    case apple = "apple.com"
    /// Gateway-minted custom token (the email 6-digit-code flow).
    case custom
}

/// The persisted Houston session — the iOS mirror of the desktop `Session`
/// (`identity/session.ts`): the Firebase ID token (the gateway bearer), the
/// long-lived refresh token, the identity claims the UI shows, and the absolute
/// ID-token expiry resolved once at receipt so refresh scheduling never depends
/// on a clock-relative field surviving a restart. Stored as one JSON blob in
/// the Keychain.
///
/// Shape tolerance lives in `AuthKeychain.load()`: a blob that does not decode
/// as this shape (a legacy Supabase session, truncated JSON, a future shape) is
/// discarded with a log — treated as signed out, never a crash.
struct AuthSession: Codable, Equatable {
    /// Firebase ID token (JWT). The gateway bearer.
    var idToken: String
    /// Long-lived Firebase refresh token (not rotated).
    var refreshToken: String
    /// Firebase UID — `sub` of the ID token; the gateway's opaque user id.
    var uid: String
    /// Account email (may be "" for a provider that withholds it).
    var email: String
    /// Whether the provider asserts the email is verified.
    var emailVerified: Bool
    /// Display name, when the provider supplies one.
    var displayName: String?
    /// Provider avatar URL, when supplied.
    var photoUrl: String?
    /// Which sign-in method minted this session.
    var provider: AuthProviderID
    /// Absolute expiry of `idToken`.
    var expiresAt: Date

    /// Build from a federated `signInWithIdp` result. `fallbackDisplayName`
    /// covers Apple, which supplies the name only on FIRST authorization and
    /// only natively (GCIP's `displayName` is often empty for apple.com).
    init(idp: GcipIdpResult, provider: AuthProviderID, fallbackDisplayName: String? = nil) {
        idToken = idp.idToken
        refreshToken = idp.refreshToken
        uid = idp.uid
        email = idp.email
        emailVerified = idp.emailVerified
        displayName = idp.displayName ?? fallbackDisplayName
        photoUrl = idp.photoUrl
        self.provider = provider
        expiresAt = idp.expiresAt
    }

    /// Build from a custom-token exchange (email-OTP path). The REST response
    /// carries no profile, so identity comes from the ID token's own claims.
    /// Returns `nil` when the token is malformed (surfaced as an error upstream).
    init?(tokens: GcipTokens) {
        guard let claims = IdTokenClaims.decode(tokens.idToken) else { return nil }
        idToken = tokens.idToken
        refreshToken = tokens.refreshToken
        uid = claims.sub
        email = claims.email ?? ""
        emailVerified = claims.emailVerified
        displayName = claims.name
        photoUrl = claims.picture
        provider = .custom
        expiresAt = tokens.expiresAt
    }

    /// Memberwise (tests + refresh path).
    init(
        idToken: String, refreshToken: String, uid: String, email: String,
        emailVerified: Bool, displayName: String?, photoUrl: String?,
        provider: AuthProviderID, expiresAt: Date
    ) {
        self.idToken = idToken
        self.refreshToken = refreshToken
        self.uid = uid
        self.email = email
        self.emailVerified = emailVerified
        self.displayName = displayName
        self.photoUrl = photoUrl
        self.provider = provider
        self.expiresAt = expiresAt
    }

    /// The same identity with fresh tokens — the refresh path. Profile fields
    /// carry over; only the tokens and expiry change.
    func refreshed(with tokens: GcipTokens) -> AuthSession {
        var next = self
        next.idToken = tokens.idToken
        next.refreshToken = tokens.refreshToken
        next.expiresAt = tokens.expiresAt
        return next
    }

    /// True when the ID token is within `margin` of expiry (or already past).
    func isExpiring(within margin: TimeInterval, now: Date = Date()) -> Bool {
        now.addingTimeInterval(margin) >= expiresAt
    }
}
