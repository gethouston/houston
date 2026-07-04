import SwiftUI

/// The Archived view (PARITY §2): a cross-agent list of `archived` missions.
/// There are no per-item actions here — a mission reactivates by replying in its
/// chat, so tapping a row just opens the chat. Empty copy is the exact archived
/// empty state ("Archived missions appear here. Reply to one to bring it back.").
struct ArchivedMissionsView: View {
  @Environment(\.theme) private var theme
  let agents: [AgentActivities]
  let agentFilter: String?
  let onOpen: (ChatRoute) -> Void

  private var cards: [MissionCardData] {
    MissionAggregation.archived(agents: agents, agentFilter: agentFilter)
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
            MissionCardRow(
              card: card, showsActions: false, onOpen: onOpen,
              onApprove: { _ in }, onRename: { _ in }, onArchive: { _ in }
            )
          }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
      }
    }
    .background(theme.background)
  }
}
