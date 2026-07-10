import Foundation

// Agents-tab copy. Added as a namespaced extension on the shared `Strings`
// (DesignSystem/Strings.swift) so this surface never edits — or collides on —
// that shared file.
//
// NOTE (deviation): the agents-as-contacts IA is mobile-only, so the
// last-activity line has no desktop locale key to mirror. The phrasing below is
// product-voice (no files/JSON/CLI mentions, per the Houston voice rules); if
// PARITY later pins these keys, update here.
extension Strings {
    enum Agents {
        /// Navigation title for the Agents tab.
        static let title = "Agents"

        /// The most-recent-mission line under an agent's name, in product voice.
        /// Built from the mission title + its resolved state. ONE signal per state
        /// (PARITY §4): `.needsYou` renders the bare title because the filled
        /// `NeedsYouChip` badge is the sole needs-you signal — the line must not
        /// duplicate it. `.error` keeps "Hit a snag on …" (a genuine failure is
        /// information and carries NO badge — the fold does not count `error` into
        /// `needsYouCount`, so nothing else surfaces it).
        static func lastActivity(state: MissionState, title: String) -> String {
            switch state {
            case .running: return "Working on \(title)"
            case .error: return "Hit a snag on \(title)"
            case .done: return "Finished \(title)"
            case .needsYou, .archived, .unknown: return title
            }
        }

        /// Shown under the name when the agent has no active missions yet.
        static let noActivity = "No missions yet"

        /// VoiceOver summary for an agent row's running state.
        static let runningAccessibility = "Running"
    }
}
