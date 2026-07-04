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
        static let columnRunning = "Running"
        static let columnNeedsYou = "Needs you"
        static let columnDone = "Done"

        // Mission control chrome (dashboard.json).
        static let missionControlTitle = "Mission Control"
        static let newMission = "New mission"
        static let archived = "Archived"
        static let allAgents = "All agents"

        // Card actions (board.json:cardActions).
        static let approve = "Move to done"
        static let rename = "Change title"
        static let delete = "Delete"

        // Tags (board.json:tags).
        static let tagRoutine = "Routine"
    }

    /// Mission search (dashboard.json:search / board.json:search).
    enum Search {
        static let placeholder = "Search missions"
        static let placeholderShort = "Search..."
        static let clear = "Clear search"
        static let searchingTitle = "Searching mission text"
        static let searchingDescription = "Looking through older messages now."
        static let emptyTitle = "No matching missions"
        static let emptyDescription = "Try a different search or clear the current one."
        static let historyErrorTitle = "Couldn't search every mission"
        static let historyErrorDescription = "Some older mission text could not be loaded."
        static let archivedPlaceholder = "Search archived missions"
    }

    /// Empty states (PARITY §3, dashboard.json:empty / :noAgents, board.json:archived).
    enum Empty {
        static let boardTitle = "No conversations yet"
        static let boardDescription = "Start a new conversation to delegate work to an agent."
        static let noAgentsTitle = "No agents yet"
        static let noAgentsDescription = "Build your AI team and ship the impossible."
        static let archivedTitle = "No archived missions"
        static let archivedDescription = "Archived missions appear here. Reply to one to bring it back."
    }

    /// New-mission agent picker (dashboard.json:agentPicker).
    enum AgentPicker {
        static let title = "Which agent should run this?"
        static let description = "Pick an agent to open a fresh conversation."
    }

    /// Per-agent activity summary badges (shell.json:sidebar). Plural-aware,
    /// mirroring i18next `_one` / `_other` keys with the exact en copy.
    enum Shell {
        static func needsYouCount(_ count: Int) -> String {
            count == 1 ? "1 issue needs you" : "\(count) issues need you"
        }
        static func runningCount(_ count: Int) -> String {
            count == 1 ? "1 issue running" : "\(count) issues running"
        }
    }

    /// Count badge cap for outline chips (NeedsYouChip caps at "99+", PARITY §4).
    static func cappedCount(_ count: Int) -> String {
        count > 99 ? "99+" : "\(count)"
    }
}
