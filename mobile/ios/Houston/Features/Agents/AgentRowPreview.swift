import Foundation

/// The Agents-home contact row's second-line preview (WhatsApp chat-list
/// convention), a pure projection of an ``AgentOverview`` so the selection rule
/// unit-tests without a view.
///
/// Selection (PARITY §4 — ONE signal per state): a running agent shows the
/// localized "working…" signal, tinted the accent role like WhatsApp's
/// "typing…", REGARDLESS of any needs-you count — the filled `NeedsYouChip` is
/// the one-and-only needs-you signal, so the preview never repeats it (WhatsApp
/// shows "typing…" even with an unread badge). The ONE exception is an errored
/// most-recent mission: `error` is NOT folded into `needsYouCount`, so it carries
/// NO badge, and the line is its only surface — it must win over "working…" or a
/// co-existing running mission would silently swallow the failure. An agent with
/// no running mission (and no errored last mission) shows its last-activity line,
/// which itself carries NO needs-you phrasing (the badge says the rest); or the
/// no-missions line when it has none.
enum AgentRowPreview: Equatable {
    /// The agent has a running mission: the "working…" typing-style signal.
    case working
    /// The most-recent-mission line (needs-you agents and idle agents alike).
    case activity(MissionState, String)
    /// No active missions yet.
    case none

    static func derive(_ overview: AgentOverview) -> AgentRowPreview {
        // An errored most-recent mission has no badge (error is not counted into
        // needsYouCount), so its line is the only surface — it must beat "working…".
        if let last = overview.lastActivity, last.state == .error {
            return .activity(last.state, last.title)
        }
        if overview.summary.runningCount > 0 {
            return .working
        }
        guard let last = overview.lastActivity else { return .none }
        return .activity(last.state, last.title)
    }

    /// The rendered copy. "working…" reuses the wave-1 chat title-bar string so
    /// the two surfaces stay in lockstep.
    var text: String {
        switch self {
        case .working: return Strings.Chat.TitleBar.working
        case let .activity(state, title): return Strings.Agents.lastActivity(state: state, title: title)
        case .none: return Strings.Agents.noActivity
        }
    }

    /// Whether the row tints the preview with the accent role (the "working…"
    /// signal); every other preview reads as muted metadata.
    var isWorking: Bool {
        if case .working = self { return true }
        return false
    }
}
