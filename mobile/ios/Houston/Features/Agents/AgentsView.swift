import SwiftUI

/// The Agents tab: every agent rendered as a contact (PARITY §4), sorted by
/// attention (needs-you first, then running, then recency). Tapping a contact
/// pushes its per-agent missions screen; the chat and the archived list push
/// onto this same stack. The cross-agent needs-you total is written to the
/// shared ``BadgeModel`` that badges the Mission Control tab.
///
/// Data comes from the shared cross-agent `\.agentsOverview` seam — the Agents
/// feature owns its concrete `AgentsOverviewModel`, and Mission Control reads the
/// same instance, so the per-agent `activities/<id>` fan-out runs ONCE for the
/// whole app (`AgentsOverviewSeam`). This view only retains the stream while the
/// tab is alive and derives the attention-sorted rows with
/// ``AgentsOverviewBuilder`` — no behavior lives here (client-architecture.md,
/// invariant 1).
struct AgentsView: View {
    @Environment(\.theme) private var theme
    @Environment(BadgeModel.self) private var badge
    @Environment(\.agentsOverview) private var overview

    @State private var path: [AgentsNavRoute] = []
    @State private var retention: ScopeRetention?
    /// New-mission compose flow: the picker sheet, and the agent it returned
    /// (opened as a draft chat on the sheet's dismissal so the push never races).
    @State private var presentingPicker = false
    @State private var pickedAgent: AgentListItem?

    private var overviews: [AgentOverview] { AgentsOverviewBuilder.build(overview.agents) }
    private var totalNeedsYou: Int { overviews.reduce(0) { $0 + $1.needsYouCount } }

    var body: some View {
        NavigationStack(path: $path) {
            content
                .navigationTitle(Strings.Agents.title)
                .background(theme.background)
                .toolbar { NewMissionToolbarButton { presentingPicker = true } }
                .navigationDestination(for: AgentsNavRoute.self, destination: destination)
        }
        .sheet(isPresented: $presentingPicker, onDismiss: openPickedDraft) {
            AgentPickerSheet(onPick: { pickedAgent = $0 })
        }
        .onAppear { if retention == nil { retention = overview.retain() } }
        .onDisappear { retention?.cancel(); retention = nil }
        .onChange(of: totalNeedsYou, initial: true) { _, total in badge.needsYouCount = total }
    }

    /// Open an empty draft chat for the agent the picker returned. Runs on the
    /// sheet's `onDismiss`, so the draft is pushed after the picker is gone.
    private func openPickedDraft() {
        guard let agent = pickedAgent else { return }
        pickedAgent = nil
        path.append(.chat(.draft(agentId: agent.id, title: agent.name)))
    }

    // MARK: Content

    @ViewBuilder private var content: some View {
        if overviews.isEmpty {
            if overview.loaded {
                EmptyStateView(
                    title: Strings.Empty.noAgentsTitle,
                    description: Strings.Empty.noAgentsDescription,
                    systemImage: "person.2"
                )
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            ScrollView {
                LazyVStack(spacing: Spacing.space2) {
                    ForEach(overviews) { item in
                        if let agent = agent(for: item.id) {
                            NavigationLink(value: AgentsNavRoute.missions(agent)) {
                                AgentRow(overview: item)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, Spacing.space12)
                .padding(.vertical, Spacing.space8)
            }
        }
    }

    // MARK: Navigation

    @ViewBuilder private func destination(_ route: AgentsNavRoute) -> some View {
        switch route {
        case let .missions(agent):
            AgentMissionsView(
                agent: agent,
                onOpenChat: { path.append(.chat($0)) },
                onOpenArchived: { path.append(.archived(agent)) }
            )
        case let .chat(route):
            ChatView(
                agentId: route.agentId, conversationId: route.sessionKey,
                title: route.title, agentName: agent(for: route.agentId)?.name)
        case let .archived(agent):
            AgentArchivedMissionsView(agent: agent, onOpen: { path.append(.chat($0)) })
        }
    }

    private func agent(for id: String) -> AgentListItem? {
        overview.agents.first { $0.id == id }?.agent
    }
}
