import SwiftUI

/// A plain system line (PARITY §5), centered and muted.
struct SystemLineView: View {
  @Environment(\.theme) private var theme
  let text: String

  var body: some View {
    Text(text)
      .font(Typography.caption)
      .foregroundStyle(theme.mutedFg)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity, alignment: .center)
      .padding(.vertical, Spacing.space4)
  }
}

/// A local-tool runtime failure surfaced as a system message (PARITY §5):
/// "A local tool failed to start." plus the typed detail and a "Try again."
/// prompt. The retry itself is desktop chrome; mobile shows the prompt copy.
struct ToolRuntimeErrorView: View {
  @Environment(\.theme) private var theme
  let error: ToolRuntimeError

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space4) {
      Text(Strings.Chat.toolRuntimeError)
        .font(Typography.label)
        .foregroundStyle(theme.foreground)
      if !error.details.isEmpty {
        Text(error.details)
          .font(Typography.caption)
          .foregroundStyle(theme.mutedFg)
      }
      Text(Strings.Chat.tryAgain)
        .font(Typography.caption)
        .foregroundStyle(theme.mutedFg)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Spacing.space12)
    .padding(.vertical, Spacing.space8)
    .background(theme.muted, in: RoundedRectangle(cornerRadius: Radius.lg))
  }
}
