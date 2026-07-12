import Foundation

// App-shell copy. The base `Strings` enum lives in `DesignSystem/Strings.swift`
// (owned by the design-system agent); each surface adds its own namespaced
// extension to avoid merge conflicts. These are shell-level strings (tab bar +
// startup fallback) that no single feature owns.
//
// Tab labels are not specified in PARITY.md (desktop has no tab bar), so they
// use plain, product-consistent copy. If PARITY.md later pins them, update here.
extension Strings {
    enum Tabs {
        static let agents = String(localized: "tabs.agents", defaultValue: "Agents")
        static let missionControl = String(localized: "tabs.missionControl", defaultValue: "Mission Control")
        static let settings = String(localized: "tabs.settings", defaultValue: "Settings")
    }

    enum Startup {
        static let failedTitle = String(localized: "startup.failedTitle", defaultValue: "Couldn't reach Houston")
        static let failedHint = String(localized: "startup.failedHint", defaultValue: "Check your connection and reopen the app.")
    }
}
