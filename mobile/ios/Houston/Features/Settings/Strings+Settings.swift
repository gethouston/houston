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
        static let title = String(localized: "settings.title", defaultValue: "Settings")

        // Appearance (settings:appearance.*).
        static let appearanceTitle = String(localized: "settings.appearanceTitle", defaultValue: "Appearance")
        static let appearanceLight = String(localized: "settings.appearanceLight", defaultValue: "Light")
        static let appearanceDark = String(localized: "settings.appearanceDark", defaultValue: "Dark")

        // Account (settings:account.*).
        static let accountTitle = String(localized: "settings.accountTitle", defaultValue: "Account")
        static let signOut = String(localized: "settings.signOut", defaultValue: "Sign out")

        // DEVIATION (no PARITY key): shown when the JWT carries no display name.
        static let accountFallbackName = String(localized: "settings.accountFallbackName", defaultValue: "Signed in")
    }
}
