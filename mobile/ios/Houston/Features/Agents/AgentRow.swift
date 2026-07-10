import SwiftUI

/// One agent rendered as a WhatsApp chat-list row (PARITY §4): the tinted
/// Houston-helmet avatar (running glow when any mission is running) beside a
/// two-line stack. Line 1 is the agent name with a right-aligned last-activity
/// time; line 2 is the activity preview with a trailing needs-you count badge.
///
/// Purely presentational — every derivation is a pure type (``AgentRowTime``,
/// ``AgentRowPreview``, ``AgentOverview/lastActivityAt``); this view only binds.
struct AgentRow: View {
    @Environment(\.theme) private var theme
    let overview: AgentOverview

    private var preview: AgentRowPreview { AgentRowPreview.derive(overview) }
    private var timeLabel: String? { overview.lastActivityAt.map { AgentRowTime.label(for: $0) } }

    var body: some View {
        ListRow {
            HStack(spacing: Spacing.space12) {
                HoustonAvatar(
                    agentColorHex: overview.colorHex,
                    diameter: 44,
                    running: overview.isRunning
                )
                VStack(alignment: .leading, spacing: Spacing.space2) {
                    titleLine
                    previewLine
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Line 1: name + right-aligned relative time for the last activity.
    private var titleLine: some View {
        HStack(spacing: Spacing.space8) {
            Text(overview.name)
                .font(Typography.bodyMedium)
                .foregroundStyle(theme.foreground)
                .lineLimit(1)
            Spacer(minLength: Spacing.space8)
            if let timeLabel {
                Text(timeLabel)
                    .font(Typography.caption)
                    .foregroundStyle(theme.mutedFg)
                    .lineLimit(1)
            }
        }
    }

    /// Line 2: activity preview + trailing needs-you count badge.
    private var previewLine: some View {
        HStack(spacing: Spacing.space8) {
            Text(preview.text)
                .font(Typography.callout)
                .foregroundStyle(preview.isWorking ? theme.accent : theme.mutedFg)
                .lineLimit(1)
            Spacer(minLength: Spacing.space8)
            if overview.needsYouCount > 0 {
                NeedsYouChip(count: overview.needsYouCount)
            }
        }
    }
}
