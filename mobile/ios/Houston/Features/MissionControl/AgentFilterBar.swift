import SwiftUI

/// The agent filter as a horizontal row of avatar chips (PARITY §3). The default
/// "All agents" chip clears the filter; each agent chip filters the board to
/// that agent. Selection is a tinted, bordered chip; `nil` selects "All agents".
struct AgentFilterBar: View {
  @Environment(\.theme) private var theme
  let agents: [AgentListItem]
  @Binding var selection: String?

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: Spacing.space8) {
        allAgentsChip
        ForEach(agents) { agent in
          chip(
            label: agent.name,
            colorHex: nil,
            selected: selection == agent.id
          ) { selection = agent.id }
        }
      }
      .padding(.horizontal, Spacing.space16)
    }
  }

  private var allAgentsChip: some View {
    chip(label: Strings.Board.allAgents, colorHex: nil, selected: selection == nil) {
      selection = nil
    }
  }

  private func chip(
    label: String, colorHex: String?, selected: Bool, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: Spacing.space6) {
        HoustonAvatar(agentColorHex: colorHex, diameter: 20)
        Text(label)
          .font(Typography.label)
          .foregroundStyle(selected ? theme.accentFg : theme.foreground)
          .lineLimit(1)
      }
      .padding(.horizontal, Spacing.space10)
      .padding(.vertical, Spacing.space6)
      .background(selected ? theme.accent : theme.muted, in: Capsule())
      .overlay(Capsule().strokeBorder(theme.border, lineWidth: selected ? 0 : 1))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? [.isSelected] : [])
  }
}
