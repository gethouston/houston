import SwiftUI

/// The pending queued-message bubbles shown above the composer while a turn runs
/// (PARITY §5): a send typed mid-turn is held by the SDK and flushed as one
/// combined send at settle, and its text renders here as a dimmed, right-aligned
/// user bubble with a "pending" clock so the user sees what will send next.
///
/// Mirrors the desktop composer's queued-bubble affordance
/// (`packages/web/src/engine-adapter/send-queue.ts`). Rendered only when the VM
/// publishes a non-empty `queued` list.
struct QueuedMessagesView: View {
  let messages: [QueuedMessageVM]

  var body: some View {
    VStack(spacing: Spacing.space6) {
      ForEach(messages) { message in
        QueuedBubble(message: message)
      }
    }
    .padding(.horizontal, Spacing.space12)
    .padding(.top, Spacing.space6)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Strings.Chat.queued)
  }
}

/// One pending queued message: a dimmed user bubble with a leading clock glyph
/// and, when present, its attachment names.
private struct QueuedBubble: View {
  @Environment(\.theme) private var theme
  let message: QueuedMessageVM

  var body: some View {
    HStack(alignment: .bottom, spacing: Spacing.space6) {
      Spacer(minLength: Spacing.space40)
      Image(systemName: "clock")
        .font(Typography.caption)
        .foregroundStyle(theme.inkMuted)
      VStack(alignment: .trailing, spacing: Spacing.space2) {
        Text(message.text)
          .font(Typography.body)
          .foregroundStyle(theme.ink)
          .padding(.horizontal, Spacing.space16)
          .padding(.vertical, Spacing.space10)
          .background(theme.chipSubtle, in: RoundedRectangle(cornerRadius: ChatMetrics.bubbleRadius))
        if let names = message.attachmentNames, !names.isEmpty {
          Text(names.joined(separator: ", "))
            .font(Typography.caption)
            .foregroundStyle(theme.inkMuted)
            .lineLimit(1)
        }
      }
      .opacity(0.6)  // visually pending until the queued send flushes at settle
    }
  }
}
