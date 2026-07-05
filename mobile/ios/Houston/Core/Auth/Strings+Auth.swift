import Foundation

/// Auth surface copy. EXACT English strings mirror the desktop sign-in screen
/// (`app/src/components/auth/sign-in-screen.tsx`). No em dashes (project rule).
///
/// `Strings` is owned by the design-system target; this nested enum is the
/// Auth surface's additive contribution (per the pinned Strings convention).
extension Strings {
    enum Auth {
        static let welcomeTitle = "Welcome to Houston"
        static let welcomeSubtitle = "Sign in to save your agents and keep everything in sync."
        static let continueWithGoogle = "Continue with Google"
        static let continuePending = "Opening browser..."
        static let retryHint = "Wrong browser profile? Just click again to retry."
    }
}
