import SwiftUI

/// The desktop-parity composer (PARITY §2): a `bg-card` glass surface, 1px
/// border/50, rounded-28, p-2.5, holding a growing multiline textarea (capped at
/// 208pt then scrolls) and a 36pt filled send button that MORPHS into a solid
/// Stop square while the turn runs. The textarea is NOT disabled while running.
///
/// Deferred (PARITY §2): the leading + attach button, the Dictate mic, and the
/// whole footer row (Skills / model / effort / context gauge).
struct MissionComposer: View {
  @Environment(\.theme) private var theme
  @Binding var text: String
  /// True while a turn is in flight — the send button becomes Stop.
  var isRunning: Bool
  /// The placeholder copy (new mission vs. follow-up), chosen by the caller.
  var placeholder: String
  let onSend: () -> Void
  let onStop: () -> Void

  @FocusState private var focused: Bool

  private var hasContent: Bool {
    !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  var body: some View {
    HStack(alignment: .bottom, spacing: Spacing.space8) {
      textarea
      trailingButton
    }
    .padding(Spacing.space10)
    .background(theme.card, in: RoundedRectangle(cornerRadius: Radius.composer))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.composer)
        .strokeBorder(theme.border.opacity(0.5), lineWidth: 1))
    .shadow(color: .black.opacity(0.06), radius: 6, y: 1)
    .padding(.horizontal, Spacing.space16)
    .padding(.vertical, Spacing.space8)
  }

  private var textarea: some View {
    TextField(placeholder, text: $text, axis: .vertical)
      .textFieldStyle(.plain)
      .lineLimit(1...8)
      .font(Typography.body)
      .foregroundStyle(theme.foreground)
      .tint(theme.primary)
      .frame(maxHeight: ChatMetrics.composerMaxHeight)
      .padding(.horizontal, Spacing.space8)
      .padding(.vertical, Spacing.space6)
      .focused($focused)
      .submitLabel(.send)
      .onSubmit(onSend)
  }

  /// The single 36pt `bg-primary` circle: an ArrowUp send glyph that morphs to a
  /// solid Stop square while running. Disabled (opacity 30%) when idle + empty.
  private var trailingButton: some View {
    Button {
      isRunning ? onStop() : onSend()
    } label: {
      ZStack {
        Circle().fill(theme.primary)
        Image(systemName: isRunning ? "square.fill" : "arrow.up")
          .font(.system(
            size: isRunning ? ChatMetrics.stopGlyphSize : ChatMetrics.sendGlyphSize,
            weight: .semibold))
          .foregroundStyle(theme.primaryFg)
      }
      .frame(width: ChatMetrics.sendButtonSize, height: ChatMetrics.sendButtonSize)
      .opacity(isRunning || hasContent ? 1 : 0.3)
      .animation(.smooth(duration: Motion.fast), value: isRunning)
      .animation(.smooth(duration: Motion.fast), value: hasContent)
    }
    .buttonStyle(.plain)
    .disabled(!isRunning && !hasContent)
    .accessibilityLabel(isRunning ? Strings.Chat.stop : Strings.Chat.send)
  }
}
