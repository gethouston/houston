import Foundation

/// Auth surface copy. EXACT English strings mirror the desktop sign-in screen
/// (`app/src/components/auth/sign-in-screen.tsx`). No em dashes (project rule).
///
/// `Strings` is owned by the design-system target; this nested enum is the
/// Auth surface's additive contribution (per the pinned Strings convention).
extension Strings {
    enum Auth {
        static let welcomeTitle = String(localized: "auth.welcomeTitle", defaultValue: "Welcome to Houston")
        static let welcomeSubtitle = String(localized: "auth.welcomeSubtitle", defaultValue: "Sign in to save your agents and keep everything in sync.")
        static let continueWithGoogle = String(localized: "auth.continueWithGoogle", defaultValue: "Continue with Google")
        static let continuePending = String(localized: "auth.continuePending", defaultValue: "Opening browser...")
        static let retryHint = String(localized: "auth.retryHint", defaultValue: "Wrong browser profile? Just click again to retry.")
    }
}
