import SwiftUI

/// A subtle centered divider for a conversation boundary (PARITY §5): a hairline
/// rule flanking a small muted caption. Used for `context_compacted` and
/// `provider_switched`, which keep the full chat above and below visible.
struct FeedDivider: View {
  @Environment(\.theme) private var theme
  let caption: String

  var body: some View {
    HStack(spacing: Spacing.space8) {
      rule
      Text(caption)
        .font(Typography.caption)
        .foregroundStyle(theme.mutedFg)
        .fixedSize(horizontal: false, vertical: true)
        .multilineTextAlignment(.center)
      rule
    }
    .padding(.vertical, Spacing.space8)
  }

  private var rule: some View {
    Rectangle()
      .fill(theme.border)
      .frame(height: 1)
      .frame(maxWidth: .infinity)
  }
}
