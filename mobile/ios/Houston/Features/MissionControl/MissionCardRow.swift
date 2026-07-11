import SwiftUI

/// A mission card as a tappable `List` row with its explicit actions (PARITY §1):
/// tap opens the chat; a context menu and trailing swipe expose Rename and
/// Archive. Composed once so the pager columns and any other active list share
/// identical affordances. Archived rows pass `showsActions: false` — reactivation
/// there is by replying, not an action. (Move-to-done was removed from the lists;
/// a mission-moving affordance is a later design.)
struct MissionCardRow: View {
  let card: MissionCardData
  var showsActions: Bool = true
  let onOpen: (ChatRoute) -> Void
  let onRename: (MissionCardData) -> Void
  let onArchive: (MissionCardData) -> Void

  var body: some View {
    Button { onOpen(card.chatRoute) } label: {
      MissionCardView(card: card)
    }
    .buttonStyle(.plain)
    .listRowInsets(EdgeInsets(top: Spacing.space6, leading: Spacing.space16,
                              bottom: Spacing.space6, trailing: Spacing.space16))
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
    .modifier(MissionCardActions(
      card: card, showsActions: showsActions,
      onRename: onRename, onArchive: onArchive
    ))
  }
}

/// The Rename / Archive affordances, as both a context menu and a trailing swipe.
/// Split out so `MissionCardRow` stays about layout.
private struct MissionCardActions: ViewModifier {
  let card: MissionCardData
  let showsActions: Bool
  let onRename: (MissionCardData) -> Void
  let onArchive: (MissionCardData) -> Void

  func body(content: Content) -> some View {
    guard showsActions else { return AnyView(content) }
    return AnyView(
      content
        .contextMenu {
          Button { onRename(card) } label: {
            Label(Strings.Board.rename, systemImage: "pencil")
          }
          Button(role: .destructive) { onArchive(card) } label: {
            Label(Strings.MissionControl.archiveAction, systemImage: "archivebox")
          }
        }
        .swipeActions(edge: .trailing) {
          Button(role: .destructive) { onArchive(card) } label: {
            Label(Strings.MissionControl.archiveAction, systemImage: "archivebox")
          }
        }
    )
  }
}
