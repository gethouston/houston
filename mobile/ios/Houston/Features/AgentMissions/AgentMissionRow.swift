import SwiftUI

/// One mission on the per-agent missions screen: a slim, sober `List` row (the
/// WhatsApp-style conversation line — ``MissionRowContent``, no avatar/card) that
/// opens the chat on tap, with explicit actions via context menu and trailing
/// swipe (PARITY §1 — no drag). This screen adds **Delete** to Rename / Archive.
/// Rows are plain List rows: default background and the List's inset hairline
/// separators, inset from the text start.
struct AgentMissionRow: View {
    let card: MissionCardData
    let onOpen: (ChatRoute) -> Void
    let onRename: (MissionCardData) -> Void
    let onArchive: (MissionCardData) -> Void
    let onDelete: (MissionCardData) -> Void

    var body: some View {
        Button { onOpen(card.chatRoute) } label: {
            MissionRowContent(line: MissionRowLine.derive(card))
        }
        .buttonStyle(.plain)
        .listRowInsets(EdgeInsets(top: Spacing.space10, leading: Spacing.space16,
                                  bottom: Spacing.space10, trailing: Spacing.space16))
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
