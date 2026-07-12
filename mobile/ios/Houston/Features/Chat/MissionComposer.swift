import SwiftUI

/// The chat input bar, built to the mobile-messaging standard (WhatsApp /
/// Telegram): a full-width bar the chat container pins above the keyboard with
/// `.safeAreaInset(edge: .bottom)`, a rounded growing text field, and a circular
/// send button that springs in when there is text and morphs to Stop while a turn
/// runs. Return inserts a NEWLINE (send is the button, not the key) — the mobile
/// convention. Attach / emoji / mic are intentionally omitted (out of scope).
///
/// Pure send-state (send vs. stop vs. disabled) lives in ``ComposerLogic`` so it
/// is unit-tested without a running UI; this view only draws it.
struct MissionComposer<PlusMenu: View>: View {
  @Environment(\.theme) private var theme
  @Binding var text: String
  /// True while a turn is in flight — the send button becomes Stop.
  var isRunning: Bool
  /// Placeholder copy (fresh mission vs. "Message"), chosen by the caller.
  var placeholder: String
  /// Focus the field once on appear (a draft's WhatsApp new-chat behavior). The
  /// focus is deferred past the push transition so it never fights it; existing
  /// missions pass `false` and never steal focus.
  var autoFocus: Bool = false
  /// Staged attachments present: the send button activates even with no typed
  /// text (attachments-only send, WhatsApp-style).
  var hasAttachments: Bool = false
  /// A send (upload → turn) is in flight before the turn starts running: the
  /// send button shows a spinner and is disabled so the upload can't be
  /// double-fired.
  var isSending: Bool = false
  let onSend: () -> Void
  let onStop: () -> Void
  /// The leading "+" affordance (WhatsApp layout): its items render in a native
  /// anchored `Menu` that pops up AT the button — the same visual family as the
  /// long-press message menu, never a detached dialog. The composer stays
  /// container-agnostic: ``ChatView`` supplies the items (attach file / photo,
  /// choose model / effort).
  @ViewBuilder let plusMenu: () -> PlusMenu

  @FocusState private var focused: Bool
  /// Guards the auto-focus to a single shot (the field must never re-grab focus
  /// on a later re-appear, e.g. after the draft becomes a real conversation).
  @State private var didAutoFocus = false

  private var hasContent: Bool { ComposerLogic.hasContent(text) }
  /// There is something to send: typed text OR staged attachments.
  private var canSubmit: Bool { hasContent || hasAttachments }
  /// The send button is drawn at full size + interactive: a running turn (Stop),
  /// or something to submit. An in-flight upload keeps it prominent but disabled.
  private var active: Bool { isRunning || canSubmit }

  var body: some View {
    HStack(alignment: .bottom, spacing: Spacing.space8) {
      plusButton
      field
      sendButton
    }
    .padding(.horizontal, ChatMetrics.inputBarHInset)
    .padding(.vertical, ChatMetrics.inputBarVInset)
    .frame(maxWidth: .infinity)
    .background(barSurface)
    .task { await autoFocusIfNeeded() }
  }

  /// Open the keyboard once for a draft, after the navigation push settles so the
  /// focus animation doesn't fight the transition. No-op for existing missions
  /// (`autoFocus == false`) and after the first run.
  private func autoFocusIfNeeded() async {
    guard autoFocus, !didAutoFocus else { return }
    didAutoFocus = true
    try? await Task.sleep(for: .seconds(Motion.elegant))
    guard !Task.isCancelled else { return }
    focused = true
  }

  /// The bar's own surface: a subtle material distinct from the chat background,
  /// with a hairline top separator. It extends past the home indicator so no chat
  /// content shows beneath it — the container's `safeAreaInset` tracks the
  /// keyboard, this only fills the bottom safe area (never the keyboard region).
  private var barSurface: some View {
    Rectangle()
      .fill(.regularMaterial)
      .overlay(alignment: .top) {
        Rectangle()
          .fill(theme.line)
          .frame(height: ChatMetrics.inputBarHairline)
      }
      .ignoresSafeArea(.container, edges: .bottom)
  }

  /// The leading "+" glyph (no filled circle, WhatsApp/Telegram style), muted so
  /// it sits quietly beside the field. Aligned to the bottom so it stays centered
  /// on the first line as the field grows. A `Menu` so the items appear anchored
  /// at the button (rising above it here at the screen's bottom edge).
  private var plusButton: some View {
    Menu {
      plusMenu()
    } label: {
      Image(systemName: "plus")
        .font(.system(size: ChatMetrics.plusGlyphSize, weight: .regular))
        .foregroundStyle(theme.inkMuted)
        .frame(width: ChatMetrics.plusButtonSize, height: ChatMetrics.plusButtonSize)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Strings.Chat.addAttachment)
  }

  private var field: some View {
    TextField(placeholder, text: $text, axis: .vertical)
      .textFieldStyle(.plain)
      .lineLimit(1...ChatMetrics.inputFieldMaxLines)
      .font(Typography.body)
      .foregroundStyle(theme.ink)
      .tint(theme.action)
      .padding(.horizontal, ChatMetrics.inputFieldHInset)
      .padding(.vertical, ChatMetrics.inputFieldVInset)
      .background(
        RoundedRectangle(cornerRadius: ChatMetrics.inputFieldRadius, style: .continuous)
          .fill(theme.chip))
      .focused($focused)
  }

  /// The 34pt trailing circle: `arrow.up` that springs to full size when there is
  /// text and symbol-morphs to `stop.fill` while a turn runs. The light send
  /// haptic is fired by the container (``ChatView``), keeping this purely visual.
  private var sendButton: some View {
    Button {
      isRunning ? onStop() : onSend()
    } label: {
      ZStack {
        Circle().fill(active ? theme.action : theme.chipSubtle)
        glyph
      }
      .frame(width: ChatMetrics.sendButtonSize, height: ChatMetrics.sendButtonSize)
    }
    .buttonStyle(.plain)
    .scaleEffect(active ? 1 : ChatMetrics.sendIdleScale)
    .opacity(active ? 1 : ChatMetrics.sendIdleOpacity)
    .animation(.snappy(duration: Motion.fast), value: active)
    .animation(.smooth(duration: Motion.fast), value: isRunning)
    // Disabled while uploading (pre-turn) so the send can't double-fire, and
    // when idle with nothing to submit.
    .disabled((isSending && !isRunning) || (!isRunning && !canSubmit))
    .accessibilityLabel(isRunning ? Strings.Chat.stop : Strings.Chat.send)
  }

  /// The button's inner glyph: a spinner while the upload is in flight
  /// (pre-turn), Stop while the turn runs, else the paper-plane send arrow.
  @ViewBuilder private var glyph: some View {
    if isSending && !isRunning {
      ProgressView()
        .controlSize(.small)
        .tint(theme.actionText)
    } else {
      Image(systemName: isRunning ? "stop.fill" : "paperplane.fill")
        .font(.system(size: ChatMetrics.sendGlyphSize, weight: .semibold))
        .foregroundStyle(active ? theme.actionText : theme.inkMuted)
        .contentTransition(.symbolEffect(.replace))
    }
  }
}
