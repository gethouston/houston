import SwiftUI

/// The per-agent missions screen (pushed from a contact row): a sober,
/// WhatsApp-style conversation list — no header, no avatar (the inline nav title
/// already names the agent, the helmet already lives on the home row). Missions
/// are grouped in PARITY order (Needs you incl. error, Running, Done) with
/// explicit per-mission actions, and an Archived entry. A new mission starts from
/// the SAME top `square.and.pencil` compose button used on the Agents tab and
/// Mission Control — here PRE-SCOPED to this agent (no picker: it opens a draft
/// chat directly). Tapping an existing mission opens its chat.
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

    @State private var retention: ScopeRetention?

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
        content
            .background(theme.background)
            .navigationTitle(agent.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                NewMissionToolbarButton {
                    onOpenChat(.draft(agentId: agent.id, title: agent.name))
                }
            }
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
                onRename: startRename, onArchive: startArchive, onDelete: startDelete
            )
        }
    }

    // MARK: Actions

    private var deletePresented: Binding<Bool> {
        Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } })
    }

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
