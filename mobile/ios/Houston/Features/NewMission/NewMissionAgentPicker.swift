import SwiftUI

/// The agent picker (PARITY §6): "Which agent should run this?" / "Pick an agent
/// to open a fresh conversation." Agents are listed recents-first (by most recent
/// activity). Picking one hands the agent back to the caller (``AgentPickerSheet``),
/// which opens an empty draft chat for it. A pure list of agents + an `onPick`
/// callback, so it stays reusable by the compose buttons on both top tabs.
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
                .foregroundStyle(theme.ink)
              Text(Strings.AgentPicker.description)
                .font(Typography.callout)
                .foregroundStyle(theme.inkMuted)
            }
            .textCase(nil)
            .padding(.bottom, Spacing.space8)
          }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
      }
    }
    .background(theme.input)
    .navigationTitle(Strings.NewMission.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  private func row(_ agent: AgentListItem) -> some View {
    Button { onPick(agent) } label: {
      HStack(spacing: Spacing.space12) {
        HoustonAvatar(agentColorHex: nil, diameter: 32)
        Text(agent.name)
          .font(Typography.bodyMedium)
          .foregroundStyle(theme.ink)
        Spacer(minLength: Spacing.space8)
        Image(systemName: "chevron.right")
          .font(Typography.caption)
          .foregroundStyle(theme.inkMuted)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
  }
}
