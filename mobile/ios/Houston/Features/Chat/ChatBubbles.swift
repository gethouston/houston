import SwiftUI

/// The two conversational messages (PARITY §3).
///
/// User: right-aligned, `max-w-70%`, faint `bg-muted`, `text-foreground`,
/// rounded-22, px-4 py-2.5 — NO tail, no avatar, no timestamp.
///
/// Assistant: full-width, NO bubble / background / border / tail / avatar — just
/// `text-foreground` markdown prose. Streaming updates in place under the stable
/// row id, so a growing reply mutates only this row.

/// A user message bubble, right-aligned on the faint muted fill.
struct UserBubble: View {
  @Environment(\.theme) private var theme
  let text: String
  /// Author label, shown only in multiplayer conversations (PARITY §3).
  var author: String?

  var body: some View {
    HStack {
      Spacer(minLength: Spacing.space40)
      VStack(alignment: .trailing, spacing: Spacing.space2) {
        if let author {
          Text(author)
            .font(Typography.caption)
            .foregroundStyle(theme.mutedFg)
        }
        Text(text)
          .font(Typography.body)
          .foregroundStyle(theme.foreground)
          .padding(.horizontal, Spacing.space16)
          .padding(.vertical, Spacing.space10)
          .background(theme.muted, in: RoundedRectangle(cornerRadius: ChatMetrics.bubbleRadius))
          .textSelection(.enabled)
      }
    }
  }
}

/// A full-width assistant message: markdown prose, no bubble. The stable row id
/// keeps a streaming reply mutating this row in place; the text animation keeps
/// the growth smooth (PARITY §3).
struct AssistantMessage: View {
  let text: String

  var body: some View {
    MarkdownText(text: text)
      .frame(maxWidth: .infinity, alignment: .leading)
      .animation(.smooth(duration: Motion.fast), value: text)
  }
}
