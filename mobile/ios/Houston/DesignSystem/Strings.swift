import Foundation

// The user-facing copy root. Every visible string flows through `Strings` so
// copy stays in lockstep with the desktop locale files (app/src/locales/en/*.json)
// — the EXACT en copy is mirrored here (PARITY is law).
//
// Surface agents ADD their own copy in `Features/<X>/Strings+<X>.swift`
// extensions (e.g. `extension Strings { enum Chat { ... } }`) to avoid editing —
// and colliding on — this shared file. This file owns only cross-surface copy.
enum Strings {
    /// Kanban board / mission-card copy (dashboard.json, board.json).
    enum Board {
        static let columnRunning = String(localized: "board.columnRunning", defaultValue: "Running")
        static let columnNeedsYou = String(localized: "board.columnNeedsYou", defaultValue: "Needs you")
        static let columnDone = String(localized: "board.columnDone", defaultValue: "Done")

        // Mission control chrome (dashboard.json).
        static let missionControlTitle = String(localized: "board.missionControlTitle", defaultValue: "Mission Control")
        static let newMission = String(localized: "board.newMission", defaultValue: "New mission")
        static let archived = String(localized: "board.archived", defaultValue: "Archived")
        static let allAgents = String(localized: "board.allAgents", defaultValue: "All agents")

        // Card actions (board.json:cardActions). Move-to-done was removed from
        // the lists; a mission-moving affordance is a later design.
        static let rename = String(localized: "board.rename", defaultValue: "Change title")
        static let delete = String(localized: "board.delete", defaultValue: "Delete")

        // Tags (board.json:tags).
        static let tagRoutine = String(localized: "board.tagRoutine", defaultValue: "Routine")
    }

    /// Mission search (dashboard.json:search / board.json:search).
    enum Search {
        static let placeholder = String(localized: "search.placeholder", defaultValue: "Search missions")
        static let placeholderShort = String(localized: "search.placeholderShort", defaultValue: "Search...")
        static let clear = String(localized: "search.clear", defaultValue: "Clear search")
        static let searchingTitle = String(localized: "search.searchingTitle", defaultValue: "Searching mission text")
        static let searchingDescription = String(localized: "search.searchingDescription", defaultValue: "Looking through older messages now.")
        static let emptyTitle = String(localized: "search.emptyTitle", defaultValue: "No matching missions")
        static let emptyDescription = String(localized: "search.emptyDescription", defaultValue: "Try a different search or clear the current one.")
        static let historyErrorTitle = String(localized: "search.historyErrorTitle", defaultValue: "Couldn't search every mission")
        static let historyErrorDescription = String(localized: "search.historyErrorDescription", defaultValue: "Some older mission text could not be loaded.")
        static let archivedPlaceholder = String(localized: "search.archivedPlaceholder", defaultValue: "Search archived missions")
    }

    /// Empty states (PARITY §3, dashboard.json:empty / :noAgents, board.json:archived).
    enum Empty {
        static let boardTitle = String(localized: "empty.boardTitle", defaultValue: "No conversations yet")
        static let boardDescription = String(localized: "empty.boardDescription", defaultValue: "Start a new conversation to delegate work to an agent.")
        static let noAgentsTitle = String(localized: "empty.noAgentsTitle", defaultValue: "No agents yet")
        static let noAgentsDescription = String(localized: "empty.noAgentsDescription", defaultValue: "Build your AI team and ship the impossible.")
        static let archivedTitle = String(localized: "empty.archivedTitle", defaultValue: "No archived missions")
        static let archivedDescription = String(localized: "empty.archivedDescription", defaultValue: "Archived missions appear here. Reply to one to bring it back.")
    }

    /// New-mission agent picker (dashboard.json:agentPicker).
    enum AgentPicker {
        static let title = String(localized: "agentPicker.title", defaultValue: "Which agent should run this?")
        static let description = String(localized: "agentPicker.description", defaultValue: "Pick an agent to open a fresh conversation.")
    }

    /// Per-agent activity summary badges (shell.json:sidebar). Plural-aware,
    /// mirroring i18next `_one` / `_other` keys with the exact en copy.
    enum Shell {
        static func needsYouCount(_ count: Int) -> String {
            String(localized: "shell.needsYouCount", defaultValue: "\(count) issues need you")
        }
        static func runningCount(_ count: Int) -> String {
            String(localized: "shell.runningCount", defaultValue: "\(count) issues running")
        }
    }

    /// Count badge cap for the needs-you chip (NeedsYouChip caps at "99+", PARITY §4).
    static func cappedCount(_ count: Int) -> String {
        count > 99 ? "99+" : "\(count)"
    }
}
