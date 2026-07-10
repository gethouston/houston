import Foundation

/// The rendered content of one slim mission row on the per-agent missions screen
/// (the WhatsApp-style conversation list). Pure so the running / error /
/// needs-you / done / no-description cases unit-test without a view; the row view
/// only binds text and tint.
///
/// Line 1 is the mission `title` plus a calendar-style relative `time`. Line 2 is the
/// ``SecondLine``: a running mission shows the accent-tinted "working…" signal
/// (the SAME wording as the Agents-home row and the chat title bar), an errored
/// mission shows the destructive-tinted snag phrasing, and every other mission
/// shows its muted description preview — or nothing, so the row collapses to one
/// line. `needs_you` and `done` add no extra chrome: the section header already
/// carries that signal (sober = trust the structure).
struct MissionRowLine: Equatable {
    let title: String
    /// WhatsApp calendar-style label (time today / "Yesterday" / weekday / short
    /// date) — the SAME convention as the Agents-home rows, so the two
    /// conversation lists read as one surface. `nil` when the timestamp is absent
    /// or unparseable, so the row hides the time rather than showing a wrong one.
    let time: String?
    let secondLine: SecondLine

    /// The second line's content + tint role. `none` collapses the row to one line.
    enum SecondLine: Equatable {
        /// Accent-tinted running signal (reuses the shared "Working…" string).
        case working
        /// Destructive-tinted snag phrasing for an errored mission.
        case snag
        /// Muted plain description preview.
        case description(String)
        /// No second line — the row shows the title alone.
        case none

        /// The rendered copy, or `nil` for `none`.
        var text: String? {
            switch self {
            case .working: return Strings.Chat.TitleBar.working
            case .snag: return Strings.AgentMissions.snag
            case let .description(text): return text
            case .none: return nil
            }
        }
    }

    /// Derive the row content from a mission card. Running dominates (shows
    /// "working…"), then error (snag); otherwise the description preview when the
    /// mission has one, else nothing.
    static func derive(_ card: MissionCardData, now: Date = Date()) -> MissionRowLine {
        MissionRowLine(
            title: card.title,
            time: card.updatedAt
                .flatMap(ActivityTimestamp.date(from:))
                .map { AgentRowTime.label(for: $0, now: now) },
            secondLine: secondLine(for: card)
        )
    }

    private static func secondLine(for card: MissionCardData) -> SecondLine {
        switch card.state {
        case .running: return .working
        case .error: return .snag
        default:
            return card.descriptionPreview.isEmpty ? .none : .description(card.descriptionPreview)
        }
    }
}
