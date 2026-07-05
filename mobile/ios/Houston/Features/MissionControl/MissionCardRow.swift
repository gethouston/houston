import SwiftUI

/// A mission card as a tappable `List` row with its explicit actions (PARITY §1):
/// tap opens the chat; a context menu and trailing swipe expose Approve (only
/// for `needs_you`), Rename, and Archive. Composed once so the pager columns and
/// any other active list share identical affordances. Archived rows pass
/// `showsActions: false` — reactivation there is by replying, not an action.
struct MissionCardRow: View {
  let card: MissionCardData
  var showsActions: Bool = true
  let onOpen: (ChatRoute) -> Void
  let onApprove: (MissionCardData) -> Void
  let onRename: (MissionCardData) -> Void
  let onArchive: (MissionCardData) -> Void

  private var canApprove: Bool { showsActions && card.state == .needsYou }

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
      card: card, showsActions: showsActions, canApprove: canApprove,
      onApprove: onApprove, onRename: onRename, onArchive: onArchive
    ))
  }
}

/// The Approve / Rename / Archive affordances, as both a context menu and a
/// trailing swipe. Split out so `MissionCardRow` stays about layout.
private struct MissionCardActions: ViewModifier {
  @Environment(\.theme) private var theme
  let card: MissionCardData
  let showsActions: Bool
  let canApprove: Bool
  let onApprove: (MissionCardData) -> Void
  let onRename: (MissionCardData) -> Void
  let onArchive: (MissionCardData) -> Void

  func body(content: Content) -> some View {
    guard showsActions else { return AnyView(content) }
    return AnyView(
      content
        .contextMenu {
          if canApprove {
            Button { onApprove(card) } label: {
              Label(Strings.Board.approve, systemImage: "checkmark.circle")
            }
          }
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
          if canApprove {
            Button { onApprove(card) } label: {
              Label(Strings.Board.approve, systemImage: "checkmark.circle")
            }
            .tint(theme.success)
          }
        }
    )
  }
}
