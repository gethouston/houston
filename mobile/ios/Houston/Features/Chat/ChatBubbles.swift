import SwiftUI
import UIKit

/// The two conversational messages.
///
/// User (you): a right-aligned bubble on a solid `theme.primary` fill — the
/// "sent" bubble, clearly visible (continuous corner). When a `timestamp` is
/// known it renders bottom-right INSIDE the bubble (WhatsApp convention); a
/// long-press lifts the bubble for a native Copy menu.
/// Assistant (the agent): full-width markdown prose, no bubble — the AI-chat
/// pattern (ChatGPT/Claude) that reads cleanly for long replies with lists/code.

/// A user message bubble, right-aligned.
struct UserBubble: View {
  @Environment(\.theme) private var theme
  let text: String
  /// Author label, shown only in multiplayer conversations.
  var author: String?
  /// The message's wall-clock time, shown bottom-right in the bubble. Optional:
  /// absent (older data) renders the bubble exactly as before, with no time.
  var timestamp: Date?

  var body: some View {
    HStack {
      Spacer(minLength: Spacing.space40)
      VStack(alignment: .trailing, spacing: Spacing.space2) {
        if let author {
          Text(author)
            .font(Typography.caption)
            .foregroundStyle(theme.mutedFg)
        }
        bubble
      }
    }
  }

  @ViewBuilder private var bubble: some View {
    content
      .padding(.horizontal, Spacing.space16)
      .padding(.vertical, Spacing.space10)
      .background(
        theme.primary,
        in: RoundedRectangle(cornerRadius: ChatMetrics.bubbleRadius, style: .continuous))
      .contextMenu {
        Button {
          UIPasteboard.general.string = text
        } label: {
          Label(Strings.Chat.copy, systemImage: "doc.on.doc")
        }
      }
  }

  @ViewBuilder private var content: some View {
    if let timestamp {
      TimedBubbleLayout {
        messageText
        Text(ChatBubbleTime.label(for: timestamp))
          .font(Typography.caption)
          .foregroundStyle(theme.primaryFg.opacity(ChatMetrics.bubbleTimeOpacity))
      }
    } else {
      messageText
    }
  }

  private var messageText: some View {
    Text(text)
      .font(Typography.body)
      .foregroundStyle(theme.primaryFg)
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
