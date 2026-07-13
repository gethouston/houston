import Foundation

/// Compile-time configuration constants for the Houston iOS app.
///
/// Everything the app needs to reach its backends lives here so there is one
/// obvious place to look and change. Values are hard-coded (not read from a
/// build-time `.env`) because the iOS build has no Vite-style define step. All
/// values are PUBLIC by design (the Firebase API key is not a secret — access
/// is gated by GCIP provider config + the gateway allowlist, exactly as the
/// desktop bakes it into every release bundle).
enum Config {
    /// Base URL of the Houston managed-cloud gateway. Every engine request the
    /// SDK makes (over the native `fetch` port) is rooted here, and the email
    /// 6-digit-code endpoints (`/v1/auth/email-otp/*`) live on it. MUST be the
    /// Go gateway deployment (it verifies the Firebase ID tokens this app
    /// mints; the legacy TS gateway only accepted Supabase JWTs).
    static let gatewayBaseURL = "https://gateway.gethouston.ai"

    /// Firebase Web API key of the `gethouston` GCP Identity Platform project —
    /// the `?key=` on every identitytoolkit/securetoken call. Same value the
    /// desktop bakes as `FIREBASE_API_KEY`.
    static let firebaseAPIKey = "AIzaSyCIFwKVLwWuYe9T51_fXkL0O49EKKbP5Uk"

    /// GCP project id — the ID-token issuer/audience the gateway verifies.
    static let firebaseProjectID = "gethouston"

    /// Google **iOS-type** OAuth client id (`<id>.apps.googleusercontent.com`),
    /// registered in the `gethouston` GCP project. Public, secret-less. Leave
    /// empty until registered — the Google button then surfaces a clear
    /// "not available yet" error instead of failing cryptically.
    static let googleIOSClientID = "" // <-- USER: paste the Google iOS OAuth client id

    /// Microsoft Entra application (client) id whose registration lists
    /// `houston://auth-callback` under "Mobile and desktop applications".
    /// Public PKCE client, no secret. Same empty-until-registered behavior.
    static let microsoftClientID = "" // <-- USER: paste the Entra app (client) id

    /// Custom URL scheme the Microsoft OAuth flow redirects back to. MUST match
    /// the `CFBundleURLTypes` entry declared in `project.yml`. (Google uses the
    /// reversed-client-ID scheme derived from `googleIOSClientID`.)
    static let authCallbackScheme = "houston"

    /// The full OAuth redirect URL registered with the Entra app for iOS.
    static let authCallbackURL = "houston://auth-callback"

    /// Whether auth is wired up. When `false`, the app boots straight past the
    /// sign-in screen assumptions — the auth layer treats sign-in as unavailable.
    static var isAuthConfigured: Bool {
        !firebaseAPIKey.isEmpty && !firebaseProjectID.isEmpty
    }
}
