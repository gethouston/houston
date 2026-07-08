import Foundation

/// The Agents-home contact row's second-line preview (WhatsApp chat-list
/// convention), a pure projection of an ``AgentOverview`` so the selection rule
/// unit-tests without a view.
///
/// Selection (PARITY §4): a `needs_you` agent keeps its product-voice
/// last-activity line; an agent that is only running (has a running mission and
/// no needs-you) shows the localized "working…" signal, tinted the accent role
/// like WhatsApp's "typing…"; an idle agent shows its last-activity line, or the
/// no-missions line when it has none.
enum AgentRowPreview: Equatable {
    /// Only running (no needs-you): the "working…" typing-style signal.
    case working
    /// The most-recent-mission line (needs-you agents and idle agents alike).
    case activity(MissionState, String)
    /// No active missions yet.
    case none

    static func derive(_ overview: AgentOverview) -> AgentRowPreview {
        if overview.summary.needsYouCount == 0, overview.summary.runningCount > 0 {
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
