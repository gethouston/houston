import SwiftUI

/// The per-agent missions screen (pushed from a contact row): an agent header,
/// missions grouped in PARITY order (Needs you incl. error, Running, Done) with
/// explicit per-mission actions, an Archived entry, and a bottom composer that
/// opens the new-mission flow PRE-SCOPED to this agent. Tapping a mission opens
/// its chat.
///
/// Data comes from the shared `\.agentsOverview` seam — this agent's activities
/// are already streaming (the Agents tab subscribed every agent's
/// `activities/<id>` scope), so this view derives its groups with
/// ``AgentMissionsGrouper`` and never runs its own fetch. Chat/archived
/// navigation is delegated to the owning `AgentsView` stack via callbacks; card
/// actions run through the shared `MissionActions` (+ the local Delete), which
/// mutate the scope so the list updates reactively — no local state mutation, no
/// silent failures (a failed action surfaces on `actionError`).
struct AgentMissionsView: View {
    @Environment(\.theme) private var theme
    @Environment(\.agentsOverview) private var overview

    let agent: AgentListItem
    let onOpenChat: (ChatRoute) -> Void
    let onOpenArchived: () -> Void
    /// Per-agent AI Models + Integrations, opened from the toolbar menu (both
    /// surfaces are per-agent — provider credentials per-pod, grants per-agent).
    let onOpenAIModels: () -> Void
    let onOpenIntegrations: () -> Void

    @State private var retention: ScopeRetention?
    @State private var presentingComposer = false

    // Action UI state.
    @State private var renameTarget: MissionCardData?
    @State private var renameText = ""
    @State private var archiveTarget: MissionCardData?
    @State private var deleteTarget: MissionCardData?
    @State private var actionError: String?

    private let actions = MissionActions()

    private var grouping: AgentMissionsGrouping {
        AgentMissionsGrouper.make(
            agent: agent,
            activities: overview.agents.first { $0.id == agent.id }?.activities ?? []
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .background(theme.background)
        .navigationTitle(agent.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { agentMenu } }
        .safeAreaInset(edge: .bottom) { composer }
        .sheet(isPresented: $presentingComposer) { NewMissionSheet(preselectedAgent: agent) }
        .missionActionDialogs(
            renameTarget: $renameTarget, renameText: $renameText,
            archiveTarget: $archiveTarget, actionError: $actionError,
            onCommitRename: commitRename, onCommitArchive: commitArchive
        )
        .confirmationDialog(
            Strings.AgentMissions.deleteConfirmTitle,
            isPresented: deletePresented, titleVisibility: .visible, presenting: deleteTarget
        ) { card in
            Button(Strings.Board.delete, role: .destructive) { commitDelete(card) }
            Button(Strings.MissionControl.cancel, role: .cancel) {}
        } message: { _ in
            Text(Strings.AgentMissions.deleteConfirmBody)
        }
        .onAppear { if retention == nil { retention = overview.retain() } }
        .onDisappear { retention?.cancel(); retention = nil }
    }

    // MARK: Pieces

    /// Toolbar overflow: this agent's AI Models + Integrations. Kept subtle (a
    /// single ellipsis menu) so the missions screen stays focused on the work.
    private var agentMenu: some View {
        Menu {
            Button { onOpenAIModels() } label: {
                Label(Strings.AIModels.title, systemImage: "cpu")
            }
            Button { onOpenIntegrations() } label: {
                Label(Strings.Integrations.title, systemImage: "puzzlepiece.extension")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .foregroundStyle(theme.foreground)
        }
        .accessibilityLabel(Strings.AgentMissions.moreMenu)
    }

    private var header: some View {
        HStack(spacing: Spacing.space12) {
            HoustonAvatar(agentColorHex: nil, diameter: 40, running: grouping.hasRunning)
            Text(agent.name)
                .font(Typography.title)
                .foregroundStyle(theme.foreground)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Spacing.space16)
        .padding(.vertical, Spacing.space12)
    }

    @ViewBuilder private var content: some View {
        if grouping.isEmpty && grouping.archivedCount == 0 {
            if overview.loaded {
                EmptyStateView(
                    title: Strings.Empty.boardTitle,
                    description: Strings.Empty.boardDescription,
                    systemImage: "tray"
                )
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            AgentMissionsSectionList(
                grouping: grouping,
                onOpen: onOpenChat, onOpenArchived: onOpenArchived,
                onApprove: approve, onRename: startRename,
                onArchive: startArchive, onDelete: startDelete
            )
        }
    }

    private var composer: some View {
        Button { presentingComposer = true } label: {
            Label(Strings.Board.newMission, systemImage: "plus")
                .font(Typography.label)
                .foregroundStyle(theme.primaryFg)
                .frame(maxWidth: .infinity)
                .padding(.vertical, Spacing.space12)
                .background(theme.primary, in: Capsule())
        }
        .padding(.horizontal, Spacing.space16)
        .padding(.vertical, Spacing.space8)
        .background(.ultraThinMaterial)
    }

    // MARK: Actions

    private var deletePresented: Binding<Bool> {
        Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } })
    }

    private func approve(_ card: MissionCardData) { run { try await actions.approve(card) } }

    private func startRename(_ card: MissionCardData) {
        renameTarget = card
        renameText = card.title
    }

    private func commitRename() {
        guard let card = renameTarget else { return }
        let title = renameText
        renameTarget = nil
        run { try await actions.rename(card, to: title) }
    }

    private func startArchive(_ card: MissionCardData) { archiveTarget = card }

    private func commitArchive() {
        guard let card = archiveTarget else { return }
        archiveTarget = nil
        run { try await actions.archive(card) }
    }

    private func startDelete(_ card: MissionCardData) { deleteTarget = card }

    private func commitDelete(_ card: MissionCardData) {
        deleteTarget = nil
        run { try await actions.delete(card) }
    }

    private func run(_ operation: @escaping () async throws -> Void) {
        Task { @MainActor in
            do { try await operation() } catch { actionError = String(describing: error) }
        }
    }
}
