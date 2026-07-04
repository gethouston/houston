import SwiftUI

/// The WhatsApp-grade composer (PARITY §5): a multiline field that grows with the
/// text (capped, then scrolls), a send button that lights up only when there is
/// something to send, and keyboard avoidance handled by the parent's bottom
/// safe-area inset. Haptics fire from the parent on send/settle.
struct MissionComposer: View {
  @Environment(\.theme) private var theme
  @Binding var text: String
  var isSending: Bool
  let onSend: () -> Void

  @FocusState private var focused: Bool

  private var canSend: Bool {
    !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSending
  }

  var body: some View {
    HStack(alignment: .bottom, spacing: Spacing.space8) {
      TextField(Strings.Chat.composerPlaceholder, text: $text, axis: .vertical)
        .lineLimit(1...6)
        .font(Typography.body)
        .foregroundStyle(theme.foreground)
        .tint(theme.primary)
        .padding(.horizontal, Spacing.space16)
        .padding(.vertical, Spacing.space10)
        .background(theme.secondary, in: RoundedRectangle(cornerRadius: Radius.composer))
        .overlay(
          RoundedRectangle(cornerRadius: Radius.composer)
            .strokeBorder(theme.border, lineWidth: 1))
        .focused($focused)
        .submitLabel(.return)

      sendButton
    }
    .padding(.horizontal, Spacing.space12)
    .padding(.vertical, Spacing.space8)
    .background(.bar)
  }

  private var sendButton: some View {
    Button(action: onSend) {
      Image(systemName: "arrow.up.circle.fill")
        .font(Typography.font(HoustonFontSize.h1, HoustonFontWeight.regular))
        .foregroundStyle(canSend ? theme.primary : theme.mutedFg)
        .symbolEffect(.bounce, value: isSending)
    }
    .disabled(!canSend)
    .scaleEffect(canSend ? 1 : 0.9)
    .animation(.smooth(duration: Motion.fast), value: canSend)
    .accessibilityLabel(Strings.Chat.send)
    .padding(.bottom, Spacing.space2)
  }
}
