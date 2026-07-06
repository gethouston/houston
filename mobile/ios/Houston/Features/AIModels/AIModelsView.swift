import SwiftUI

/// The AI Models surface (PARITY §2). Entry is per-agent because provider
/// credentials are per-agent-pod (landmine 1):
///
///  - `AIModelsView(agentId:agentName:)` — opened from an agent's screen, it
///    renders that agent's provider grid directly (inside the caller's nav stack).
///  - `AIModelsView()` — opened from the Settings tab (which has no agent
///    context), it first shows an agent picker (reusing the NewMission picker
///    pattern), then pushes the chosen agent's grid onto the ambient nav stack.
struct AIModelsView: View {
  private let agentId: String?

  /// Agent-screen entry: straight to the grid for a known agent. The display
  /// name for the scoping footer is resolved reactively from the shared
  /// `agentsOverview`, so callers only need the id.
  init(agentId: String) { self.agentId = agentId }

  /// Global (Settings) entry: pick an agent first.
  init() { self.agentId = nil }

  var body: some View {
    if let agentId {
      AIModelsAgentView(agentId: agentId)
    } else {
      AIModelsAgentPicker()
    }
  }
}

/// A resolved agent to open the AI Models grid for; the value pushed onto the
/// ambient nav stack from the global-entry picker.
struct AIModelsAgentRoute: Hashable {
  let id: String
  let name: String
}

/// The global-entry agent picker: AI models connect per agent, so choose which
/// one to set up. Mirrors the NewMission picker; pushes the grid via the ambient
/// navigation stack (no nested stack — safe whether this view was pushed or
/// presented) so the host's back button keeps working.
private struct AIModelsAgentPicker: View {
  @Environment(\.theme) private var theme
  @Environment(\.agentsOverview) private var overview
  @State private var retention: ScopeRetention?

  private var agents: [AgentListItem] {
    MissionAggregation.filterAgents(overview.agents)
  }

  var body: some View {
    content
      .navigationTitle(Strings.AIModels.title)
      .navigationBarTitleDisplayMode(.inline)
      .background(theme.background)
      .navigationDestination(for: AIModelsAgentRoute.self) { route in
        AIModelsAgentView(agentId: route.id)
      }
      .onAppear { if retention == nil { retention = overview.retain() } }
      .onDisappear { retention?.cancel(); retention = nil }
  }

  @ViewBuilder private var content: some View {
    if agents.isEmpty {
      if overview.loaded {
        EmptyStateView(
          title: Strings.NewMission.noAgentsTitle,
          description: Strings.NewMission.noAgentsDescription,
          systemImage: "person.2")
      } else {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    } else {
      List {
        Section {
          ForEach(agents) { agent in row(agent) }
        } header: {
          VStack(alignment: .leading, spacing: Spacing.space4) {
            Text(Strings.AIModels.Picker.title)
              .font(Typography.title)
              .foregroundStyle(theme.foreground)
            Text(Strings.AIModels.Picker.description)
              .font(Typography.callout)
              .foregroundStyle(theme.mutedFg)
          }
          .textCase(nil)
          .padding(.bottom, Spacing.space8)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .background(theme.background)
    }
  }

  private func row(_ agent: AgentListItem) -> some View {
    NavigationLink(value: AIModelsAgentRoute(id: agent.id, name: agent.name)) {
      HStack(spacing: Spacing.space12) {
        HoustonAvatar(agentColorHex: nil, diameter: 32)
        Text(agent.name)
          .font(Typography.bodyMedium)
          .foregroundStyle(theme.foreground)
      }
    }
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
  }
}
