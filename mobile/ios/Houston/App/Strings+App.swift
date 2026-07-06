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
        static let agents = "Agents"
        static let newMission = "New Mission"
        static let missionControl = "Mission Control"
        static let settings = "Settings"
    }

    enum Startup {
        static let failedTitle = "Couldn't reach Houston"
        static let failedHint = "Check your connection and reopen the app."
    }
}
