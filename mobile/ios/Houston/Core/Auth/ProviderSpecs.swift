import Foundation

/// The Google / Microsoft `OAuthProviderSpec`s — the iOS counterparts of the
/// desktop's `google-authorize.ts` / `microsoft-authorize.ts`.
enum ProviderSpecs {
    /// Google, via an **iOS-type** OAuth client (public, NO client secret —
    /// unlike the desktop's installed-app client). The redirect is the
    /// reversed-client-ID scheme Google mandates for iOS clients.
    static func google(clientID: String) -> OAuthProviderSpec {
        let scheme = reversedGoogleScheme(clientID: clientID)
        return OAuthProviderSpec(
            authorizeBase: "https://accounts.google.com/o/oauth2/v2/auth",
            tokenEndpoint: "https://oauth2.googleapis.com/token",
            clientID: clientID,
            scope: "openid email profile",
            redirectURI: "\(scheme):/oauth2redirect",
            callbackScheme: scheme,
            // No `access_type=offline` (desktop requests it): long-lived
            // sessions come from GCIP's own refresh token, not Google's.
            extraAuthorizeParams: [:],
            extraTokenParams: [:]
        )
    }

    /// `com.googleusercontent.apps.<id>` — the reversed form of an iOS client
    /// id `<id>.apps.googleusercontent.com`. Empty input stays empty (the flow
    /// then fails loudly on the missing-client check, never on a bad URL).
    static func reversedGoogleScheme(clientID: String) -> String {
        let suffix = ".apps.googleusercontent.com"
        guard clientID.hasSuffix(suffix) else { return "" }
        return "com.googleusercontent.apps." + clientID.dropLast(suffix.count)
    }

    /// Microsoft (Entra), `common` tenant so both work and personal accounts
    /// sign in, `prompt=select_account` so a shared device can switch accounts.
    /// Public PKCE client — the Azure app registration lists the custom-scheme
    /// redirect under "Mobile and desktop applications". No `offline_access`
    /// (desktop requests it): session longevity comes from GCIP, not Entra.
    static func microsoft(clientID: String) -> OAuthProviderSpec {
        OAuthProviderSpec(
            authorizeBase: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            clientID: clientID,
            scope: "openid email profile",
            redirectURI: Config.authCallbackURL,
            callbackScheme: Config.authCallbackScheme,
            extraAuthorizeParams: ["prompt": "select_account"],
            // Entra requires `scope` on the token exchange too.
            extraTokenParams: ["scope": "openid email profile"]
        )
    }
}
