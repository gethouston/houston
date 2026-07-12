import Foundation

// Agents-tab search copy. Added as a namespaced extension on the shared
// `Strings` (DesignSystem/Strings.swift) so this surface never edits — or
// collides on — that shared file, and kept separate from `Strings.Search`
// (which is the mission-text search on Mission Control).
//
// NOTE (deviation): the agents-as-contacts search is mobile-only, so these keys
// have no desktop locale mirror yet; the copy is minimal product voice. If
// PARITY later pins them, update here.
extension Strings {
    enum AgentsSearch {
        /// Placeholder in the pull-down search field (hidden until pulled down).
        static let placeholder = String(localized: "agentsSearch.placeholder", defaultValue: "Search")

        /// Empty-state title when a non-empty query matches no agent.
        static let noResultsTitle = String(localized: "agentsSearch.noResultsTitle", defaultValue: "No results")
    }
}
