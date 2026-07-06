import Foundation

// Settings-tab copy. Added as a namespaced extension on the shared `Strings`
// (DesignSystem/Strings.swift) so this surface never edits — or collides on —
// that shared file.
//
// The Settings tab is quick-access only (Account + Appearance), so only those
// strings remain; the workspace/language/context/report-bug/danger-zone/version
// copy was removed with those rows. PARITY IS LAW: each string mirrors the EXACT
// en copy from `app/src/locales/en/settings.json` (keys noted per group). The
// account fallback name is product-voice (no PARITY key) and flagged DEVIATION.
extension Strings {
    enum Settings {
        // Header (settings:title).
        static let title = "Settings"

        // Appearance (settings:appearance.*).
        static let appearanceTitle = "Appearance"
        static let appearanceLight = "Light"
        static let appearanceDark = "Dark"

        // Account (settings:account.*).
        static let accountTitle = "Account"
        static let signOut = "Sign out"

        // DEVIATION (no PARITY key): shown when the JWT carries no display name.
        static let accountFallbackName = "Signed in"
    }
}
