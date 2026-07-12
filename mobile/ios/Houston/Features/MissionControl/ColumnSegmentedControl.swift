import SwiftUI

/// The segmented indicator above the status pager: the three exact column labels
/// (Running · Needs you · Done, PARITY §1) with the selected one highlighted.
/// Tapping a segment animates the pager; swiping the pager moves the selection —
/// both write the same `selection` binding.
struct ColumnSegmentedControl: View {
  @Environment(\.theme) private var theme
  @Binding var selection: BoardColumn

  var body: some View {
    HStack(spacing: Spacing.space4) {
      ForEach(BoardColumn.ordered) { column in
        segment(column)
      }
    }
    .padding(Spacing.space4)
    .background(theme.chipSubtle, in: Capsule())
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Strings.MissionControl.statusPagerLabel)
  }

  private func segment(_ column: BoardColumn) -> some View {
    let selected = column == selection
    return Button {
      withAnimation(.easeInOut(duration: Motion.fast)) { selection = column }
    } label: {
      Text(column.label)
        .font(Typography.label)
        .foregroundStyle(selected ? theme.ink : theme.inkMuted)
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.space8)
        .background {
          if selected {
            Capsule().fill(theme.input)
          }
        }
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? [.isSelected] : [])
  }
}
