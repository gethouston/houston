import SwiftUI

/// The agent picker (PARITY §6): "Which agent should run this?" / "Pick an agent
/// to open a fresh conversation." Agents are listed recents-first (by most recent
/// activity). Picking one pushes the composer. Skipped entirely when the sheet is
/// opened with a preselected agent.
struct NewMissionAgentPicker: View {
  @Environment(\.theme) private var theme
  let agents: [AgentListItem]
  let onPick: (AgentListItem) -> Void

  var body: some View {
    Group {
      if agents.isEmpty {
        EmptyStateView(
          title: Strings.NewMission.noAgentsTitle,
          description: Strings.NewMission.noAgentsDescription,
          systemImage: "person.2"
        )
      } else {
        List {
          Section {
            ForEach(agents) { agent in
              row(agent)
            }
          } header: {
            VStack(alignment: .leading, spacing: Spacing.space4) {
              Text(Strings.AgentPicker.title)
                .font(Typography.title)
                .foregroundStyle(theme.foreground)
              Text(Strings.AgentPicker.description)
                .font(Typography.callout)
                .foregroundStyle(theme.mutedFg)
            }
            .textCase(nil)
            .padding(.bottom, Spacing.space8)
          }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
      }
    }
    .background(theme.background)
    .navigationTitle(Strings.NewMission.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  private func row(_ agent: AgentListItem) -> some View {
    Button { onPick(agent) } label: {
      HStack(spacing: Spacing.space12) {
        HoustonAvatar(agentColorHex: nil, diameter: 32)
        Text(agent.name)
          .font(Typography.bodyMedium)
          .foregroundStyle(theme.foreground)
        Spacer(minLength: Spacing.space8)
        Image(systemName: "chevron.right")
          .font(Typography.caption)
          .foregroundStyle(theme.mutedFg)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
  }
}
