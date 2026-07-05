import SwiftUI

/// The horizontally swipeable status pages (PARITY §1): full-screen columns in
/// column order (Running · Needs you · Done), a segmented indicator on top, and
/// a `.page`-style `TabView` body. Swiping and tapping a segment both drive the
/// same `selection`. When the whole filtered board is empty it yields to the
/// board empty state (owned by the parent) rather than three blank pages.
struct MissionControlPager: View {
  @Environment(\.theme) private var theme
  let agents: [AgentActivities]
  let agentFilter: String?
  @Binding var selection: BoardColumn
  let onOpen: (ChatRoute) -> Void
  let onApprove: (MissionCardData) -> Void
  let onRename: (MissionCardData) -> Void
  let onArchive: (MissionCardData) -> Void

  var body: some View {
    VStack(spacing: Spacing.space12) {
      ColumnSegmentedControl(selection: $selection)
        .padding(.horizontal, Spacing.space16)
      TabView(selection: $selection) {
        ForEach(BoardColumn.ordered) { column in
          page(column).tag(column)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
    }
  }

  private func page(_ column: BoardColumn) -> some View {
    let cards = MissionAggregation.missions(in: column, agents: agents, agentFilter: agentFilter)
    return List {
      ForEach(cards) { card in
        MissionCardRow(
          card: card, onOpen: onOpen,
          onApprove: onApprove, onRename: onRename, onArchive: onArchive
        )
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(theme.background)
  }
}
