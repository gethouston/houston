import SwiftUI

/// The New Mission flow (PARITY §6), presented as a sheet with its own
/// navigation: agent picker → composer → chat. Opened with a `preselectedAgent`
/// (e.g. from an agent's screen) it skips straight to the composer. On a
/// successful send it pushes into the mission's chat inside the sheet — "push
/// straight into ChatView" — reusing the injected `chatViewBuilder`.
struct NewMissionSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.agentsOverview) private var overview
  @Environment(\.chatViewBuilder) private var chatViewBuilder

  let preselectedAgent: AgentListItem?
  @State private var path: [NewMissionRoute] = []

  init(preselectedAgent: AgentListItem? = nil) {
    self.preselectedAgent = preselectedAgent
  }

  var body: some View {
    NavigationStack(path: $path) {
      root
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(Strings.NewMission.cancel) { dismiss() }
          }
        }
        .navigationDestination(for: NewMissionRoute.self, destination: destination)
    }
  }

  @ViewBuilder private var root: some View {
    if let agent = preselectedAgent {
      MissionComposerView(agent: agent, onSent: openChat)
    } else {
      NewMissionAgentPicker(
        agents: MissionAggregation.filterAgents(overview.agents),
        onPick: { path.append(.composer(agentId: $0.id)) }
      )
    }
  }

  @ViewBuilder private func destination(_ route: NewMissionRoute) -> some View {
    switch route {
    case let .composer(agentId):
      if let agent = agent(for: agentId) {
        MissionComposerView(agent: agent, onSent: openChat)
      } else {
        EmptyStateView(title: Strings.NewMission.noAgentsTitle, systemImage: "person.2")
      }
    case let .chat(chatRoute):
      chatViewBuilder(chatRoute)
    }
  }

  private func openChat(_ route: ChatRoute) { path.append(.chat(route)) }

  private func agent(for id: String) -> AgentListItem? {
    overview.agents.first { $0.agent.id == id }?.agent
  }
}

/// A step inside the New Mission sheet. Uses primitive-keyed cases (agent id)
/// so it stays `Hashable` for value-based navigation without depending on
/// `AgentListItem` being hashable.
enum NewMissionRoute: Hashable {
  case composer(agentId: String)
  case chat(ChatRoute)
}
