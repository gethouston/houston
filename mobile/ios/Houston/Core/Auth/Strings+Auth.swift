import Foundation

/// Auth surface copy. English mirrors the desktop sign-in screen
/// (`app/src/components/auth/sign-in-screen.tsx` + `email-sign-in.tsx`); error
/// buckets mirror `app/src/locales/en/errors.json` `auth.*` exactly. No em
/// dashes (project rule). The Apple button carries no copy here — SwiftUI's
/// `SignInWithAppleButton` localizes itself.
///
/// `Strings` is owned by the design-system target; this nested enum is the
/// Auth surface's additive contribution (per the pinned Strings convention).
extension Strings {
    enum Auth {
        static let welcomeTitle = String(localized: "auth.welcomeTitle", defaultValue: "Welcome to Houston")
        static let welcomeSubtitle = String(localized: "auth.welcomeSubtitle", defaultValue: "Sign in to save your agents and keep everything in sync.")
        static let continueWithGoogle = String(localized: "auth.continueWithGoogle", defaultValue: "Continue with Google")
        static let continueWithMicrosoft = String(localized: "auth.continueWithMicrosoft", defaultValue: "Continue with Microsoft")
        static let orDivider = String(localized: "auth.orDivider", defaultValue: "or")
        static let emailPlaceholder = String(localized: "auth.emailPlaceholder", defaultValue: "you@example.com")
        static let sendCode = String(localized: "auth.sendCode", defaultValue: "Send code")
        static let verifyCode = String(localized: "auth.verifyCode", defaultValue: "Verify code")
        static func codeSentTo(_ email: String) -> String {
            String(localized: "auth.codeSentTo", defaultValue: "We sent a 6-digit code to \(email).")
        }
        static let resendCode = String(localized: "auth.resendCode", defaultValue: "Resend code")
        static let useDifferentEmail = String(localized: "auth.useDifferentEmail", defaultValue: "Use a different email")

        /// User-facing failure buckets — the iOS mirror of the desktop
        /// `errors:auth.*` keys (rendered via `AuthErrorCopy`).
        enum Errors {
            static let invalidCredentials = String(localized: "auth.errors.invalidCredentials", defaultValue: "That sign-in didn't work. Check your details and try again.")
            static let credentialMismatch = String(localized: "auth.errors.credentialMismatch", defaultValue: "This email is already linked to a different sign-in method. Use the option you signed up with.")
            static let providerDisabled = String(localized: "auth.errors.providerDisabled", defaultValue: "This sign-in option isn't available yet. Try another one.")
            static let otpInvalid = String(localized: "auth.errors.otpInvalid", defaultValue: "That code is wrong or expired. Request a new one and try again.")
            static let otpRateLimited = String(localized: "auth.errors.otpRateLimited", defaultValue: "Too many attempts. Wait a minute, then try again.")
            static let network = String(localized: "auth.errors.network", defaultValue: "Can't reach the sign-in service. Check your connection and try again.")
            static let tooManyAttempts = String(localized: "auth.errors.tooManyAttempts", defaultValue: "Too many attempts. Wait a few minutes, then try again.")
            static let userDisabled = String(localized: "auth.errors.userDisabled", defaultValue: "This account has been disabled. Contact support.")
            static let configError = String(localized: "auth.errors.configError", defaultValue: "Sign-in isn't set up correctly. Please contact support.")
            static let generic = String(localized: "auth.errors.generic", defaultValue: "Sign-in failed. Please try again.")
        }
    }
}
