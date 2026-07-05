import SwiftUI

/// The reasoning block (PARITY §5): a shimmering "Thinking..." while the model
/// reasons, settling to "Thought for a few seconds" once done, with the reasoning
/// text shown in a muted, secondary style beneath the label.
struct ThinkingBlock: View {
  @Environment(\.theme) private var theme
  let text: String
  let streaming: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space6) {
      HStack(spacing: Spacing.space6) {
        Image(systemName: "brain")
          .font(Typography.caption)
          .foregroundStyle(theme.mutedFg)
        Text(ThinkingCopy.label(streaming: streaming))
          .font(Typography.label)
          .foregroundStyle(theme.mutedFg)
          .shimmer(active: streaming)
      }
      if !text.isEmpty {
        Text(text)
          .font(Typography.callout)
          .foregroundStyle(theme.mutedFg)
          .textSelection(.enabled)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Spacing.space12)
    .padding(.vertical, Spacing.space8)
    .background(theme.muted, in: RoundedRectangle(cornerRadius: Radius.xl))
    .animation(.smooth(duration: Motion.fast), value: text)
  }
}
