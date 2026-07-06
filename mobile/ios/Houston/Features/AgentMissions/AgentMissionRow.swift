import SwiftUI

/// One mission on the per-agent missions screen: a tappable `List` row that opens
/// the chat, with explicit actions via context menu and trailing swipe (PARITY §1
/// — no drag). The visual is the shared ``MissionCardView`` (title, description
/// preview, status chip, updatedAt); only the affordance set differs from Mission
/// Control's row — this screen adds **Delete** to Rename / Archive. (Move-to-done
/// was removed from the lists; a mission-moving affordance is a later design.)
struct AgentMissionRow: View {
    let card: MissionCardData
    let onOpen: (ChatRoute) -> Void
    let onRename: (MissionCardData) -> Void
    let onArchive: (MissionCardData) -> Void
    let onDelete: (MissionCardData) -> Void

    var body: some View {
        Button { onOpen(card.chatRoute) } label: {
            MissionCardView(card: card)
        }
        .buttonStyle(.plain)
        .listRowInsets(EdgeInsets(top: Spacing.space6, leading: Spacing.space16,
                                  bottom: Spacing.space6, trailing: Spacing.space16))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
        .contextMenu { menu }
        .swipeActions(edge: .trailing) { swipe }
    }

    @ViewBuilder private var menu: some View {
        Button { onRename(card) } label: {
            Label(Strings.Board.rename, systemImage: "pencil")
        }
        Button { onArchive(card) } label: {
            Label(Strings.MissionControl.archiveAction, systemImage: "archivebox")
        }
        Button(role: .destructive) { onDelete(card) } label: {
            Label(Strings.Board.delete, systemImage: "trash")
        }
    }

    @ViewBuilder private var swipe: some View {
        Button(role: .destructive) { onArchive(card) } label: {
            Label(Strings.MissionControl.archiveAction, systemImage: "archivebox")
        }
    }
}
