import SwiftUI

/// The appearance choice, DEVICE-LOCAL (PARITY-SETTINGS §1: theme has no wire —
/// it is stored per device via `@AppStorage`, never persisted to the engine).
///
/// PARITY-SETTINGS pins only `Light` and `Dark` as the selectable options
/// (`settings:appearance.{light,dark}`). When nothing has been chosen yet the
/// app follows the device's system appearance, so a dark-mode phone opens dark
/// without the user first tapping anything; picking an option pins it.
enum AppearancePreference: String, CaseIterable, Identifiable, Sendable {
    case light
    case dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .light: return Strings.Settings.appearanceLight
        case .dark: return Strings.Settings.appearanceDark
        }
    }

    /// The `UserDefaults`/`@AppStorage` key. Namespaced like the app's other
    /// device-local keys so it never collides with an engine preference.
    static let storageKey = "houston.appearance"

    /// Resolve the effective Houston theme mode from the stored choice and the
    /// device's current system scheme. Pure, so it is unit-tested without a view:
    ///   - a valid stored choice wins (the user pinned it),
    ///   - otherwise follow the system scheme,
    ///   - an unrecognized stored value is treated as unset (follow the system).
    static func resolve(stored: String?, system: ColorScheme) -> HoustonTheme {
        switch AppearancePreference(rawValue: stored ?? "") {
        case .light: return .light
        case .dark: return .dark
        case nil: return system == .dark ? .dark : .light
        }
    }

    /// The option the segmented control shows as selected for a stored value +
    /// system scheme (mirrors `resolve`, projected back onto the two options).
    static func selection(stored: String?, system: ColorScheme) -> AppearancePreference {
        resolve(stored: stored, system: system) == .dark ? .dark : .light
    }
}
