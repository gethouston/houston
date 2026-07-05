import Foundation

/// Compile-time configuration constants for the Houston iOS app.
///
/// Everything the app needs to reach its backends lives here so there is one
/// obvious place to look and change. Values are hard-coded (not read from a
/// build-time `.env`) because the iOS build has no Vite-style define step; the
/// only secret-shaped value, the Supabase anon key, is *public by design*
/// (it is RLS-guarded and ships in every client) but is left blank below for
/// the user to paste, mirroring how `DEVELOPMENT_TEAM` is left blank in
/// `project.yml`.
enum Config {
    /// Base URL of the Houston managed-cloud gateway. Every engine request the
    /// SDK makes (over the native `fetch` port) is rooted here. This is the same
    /// gateway the desktop app points at via `VITE_HOSTED_ENGINE_URL`.
    static let gatewayBaseURL = "https://gateway.gethouston.ai"

    /// Supabase project URL used for authentication (Google SSO + session JWTs).
    /// The app verifies against the same Supabase project as the gateway, so the
    /// session token the SDK attaches is accepted upstream.
    static let supabaseURL = "https://zfpnlvxazrataiannvtq.supabase.co"

    /// Supabase public anon key — the same publishable key the desktop build
    /// bakes for this project. Public by design (safe to ship in the client).
    static let supabaseAnonKey = "sb_publishable_-gCJ0xJiNOdn1qJAzBrS1w_lIHJKler"

    /// Custom URL scheme the Supabase OAuth flow redirects back to. MUST match
    /// the `CFBundleURLSchemes` entry declared in `project.yml`.
    static let authCallbackScheme = "houston"

    /// The full OAuth redirect URL registered with Supabase for this app.
    static let authCallbackURL = "houston://auth-callback"

    /// Whether auth is wired up. When `false`, the app boots straight past the
    /// sign-in screen assumptions — the auth layer treats sign-in as unavailable.
    static var isAuthConfigured: Bool {
        !supabaseURL.isEmpty && !supabaseAnonKey.isEmpty
    }
}
