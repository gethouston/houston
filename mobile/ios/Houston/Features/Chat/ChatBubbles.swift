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
  /// Delivery state (`FeedItemVM.pending`): `true` shows a clock (unconfirmed),
  /// `false`/default a single check. Rendered only alongside `timestamp` — a
  /// bubble with no time cluster shows no tick.
  var pending: Bool = false
  /// Failed delivery (`FeedItemVM.failed`): `true` shows an error tick instead of
  /// a check — the send provably never reached the agent. Mutually exclusive with
  /// `pending`; rendered only alongside `timestamp`.
  var failed: Bool = false

  /// The resolved WhatsApp-style delivery state for the tick + its VoiceOver label.
  private var delivery: ChatDelivery { ChatDelivery(pending: pending, failed: failed) }

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
      // Exactly two subviews for `TimedBubbleLayout`: the text, then the time
      // cluster (time + delivery tick as ONE trailing unit).
      TimedBubbleLayout {
        messageText
        timeCluster(timestamp)
      }
    } else {
      messageText
    }
  }

  /// The bottom-right metadata: the wall-clock time followed by the WhatsApp
  /// delivery tick. The clock→check swap animates in place via a symbol replace
  /// (same treatment as the composer's send-button morph); both read as quiet
  /// metadata at 60% of the bubble's `primaryFg`.
  private func timeCluster(_ timestamp: Date) -> some View {
    HStack(spacing: Spacing.space2) {
      Text(ChatBubbleTime.label(for: timestamp))
        .font(Typography.caption)
      Image(systemName: ChatBubbleTick.symbolName(for: delivery))
        .font(Typography.caption)
        .imageScale(.small)
        .contentTransition(.symbolEffect(.replace))
        // A failed send drops the muted treatment so the error tick reads as an
        // alert, not quiet metadata; sending/sent stay quiet like the time.
        .foregroundStyle(
          delivery == .failed
            ? theme.primaryFg : theme.primaryFg.opacity(ChatMetrics.bubbleTimeOpacity)
        )
        .animation(.snappy(duration: Motion.fast), value: delivery)
        .accessibilityLabel(deliveryLabel)
    }
    .foregroundStyle(theme.primaryFg.opacity(ChatMetrics.bubbleTimeOpacity))
  }

  /// VoiceOver label for the delivery tick, matching the resolved ``delivery``.
  private var deliveryLabel: String {
    switch delivery {
    case .sending: return Strings.Chat.deliveryPending
    case .sent: return Strings.Chat.deliverySent
    case .failed: return Strings.Chat.deliveryFailed
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
