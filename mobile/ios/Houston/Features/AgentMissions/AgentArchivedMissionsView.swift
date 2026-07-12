import SwiftUI

/// One agent's Archived missions (PARITY §2), pushed from the missions screen's
/// "Archived" row. There are **no** per-item actions here — a mission reactivates
/// by replying in its chat (the engine flips `archived → running` on send), so a
/// row just opens the chat. Empty copy is the exact archived empty state.
///
/// Reads the agent's activities from the shared `\.agentsOverview` seam (already
/// retained by the missions screen underneath), filters to `archived`, and shows
/// them most-recent first. The visual reuses the same slim ``MissionRowContent``
/// as the active list, so the two screens read as one sober conversation list.
struct AgentArchivedMissionsView: View {
    @Environment(\.theme) private var theme
    @Environment(\.agentsOverview) private var overview

    let agent: AgentListItem
    let onOpen: (ChatRoute) -> Void

    private var cards: [MissionCardData] {
        let activities = overview.agents.first { $0.id == agent.id }?.activities ?? []
        return activities
            .map { MissionCardData.make(agent: agent, activity: $0) }
            .filter { $0.state == .archived }
            .sorted { ($0.updatedAt ?? "") > ($1.updatedAt ?? "") }
    }

    var body: some View {
        Group {
            if cards.isEmpty {
                EmptyStateView(
                    title: Strings.Empty.archivedTitle,
                    description: Strings.Empty.archivedDescription,
                    systemImage: "archivebox"
                )
            } else {
                List {
                    ForEach(cards) { card in
                        Button { onOpen(card.chatRoute) } label: {
                            MissionRowContent(line: MissionRowLine.derive(card))
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: Spacing.space10, leading: Spacing.space16,
                                                  bottom: Spacing.space10, trailing: Spacing.space16))
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(theme.input)
        .navigationTitle(Strings.Board.archived)
        .navigationBarTitleDisplayMode(.inline)
    }
}
