import SwiftUI

/// One agent rendered as a contact (PARITY §4): the tinted Houston-helmet avatar
/// with a running glow when any mission is running, the name, a product-voice
/// last-activity line, and the outline needs-you count chip when > 0.
struct AgentRow: View {
    @Environment(\.theme) private var theme
    let overview: AgentOverview

    var body: some View {
        ListRow {
            HStack(spacing: Spacing.space12) {
                HoustonAvatar(
                    agentColorHex: overview.colorHex,
                    diameter: 44,
                    running: overview.isRunning
                )
                VStack(alignment: .leading, spacing: Spacing.space2) {
                    Text(overview.name)
                        .font(Typography.bodyMedium)
                        .foregroundStyle(theme.foreground)
                        .lineLimit(1)
                    Text(activityLine)
                        .font(Typography.callout)
                        .foregroundStyle(theme.mutedFg)
                        .lineLimit(1)
                }
                Spacer(minLength: Spacing.space8)
                if overview.needsYouCount > 0 {
                    NeedsYouChip(count: overview.needsYouCount)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var activityLine: String {
        guard let last = overview.lastActivity else { return Strings.Agents.noActivity }
        return Strings.Agents.lastActivity(state: last.state, title: last.title)
    }
}
