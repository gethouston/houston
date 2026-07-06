import SwiftUI

/// The two conversational messages.
///
/// User (you): a right-aligned bubble on a solid `theme.primary` fill — the
/// "sent" bubble, clearly visible (continuous corner, no tail/avatar/timestamp).
/// Assistant (the agent): full-width markdown prose, no bubble — the AI-chat
/// pattern (ChatGPT/Claude) that reads cleanly for long replies with lists/code.

/// A user message bubble, right-aligned.
struct UserBubble: View {
  @Environment(\.theme) private var theme
  let text: String
  /// Author label, shown only in multiplayer conversations.
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
          .foregroundStyle(theme.primaryFg)
          .padding(.horizontal, Spacing.space16)
          .padding(.vertical, Spacing.space10)
          .background(
            theme.primary,
            in: RoundedRectangle(cornerRadius: ChatMetrics.bubbleRadius, style: .continuous))
          .textSelection(.enabled)
      }
    }
  }
}

/// A full-width assistant message: markdown prose, no bubble. The stable row id
/// keeps a streaming reply mutating this row in place; the text animation keeps
/// the growth smooth.
struct AssistantMessage: View {
  let text: String

  var body: some View {
    MarkdownText(text: text)
      .frame(maxWidth: .infinity, alignment: .leading)
      .animation(.smooth(duration: Motion.fast), value: text)
  }
}
