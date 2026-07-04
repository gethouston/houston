import SwiftUI

/// The scrolling mission transcript. A `LazyVStack` inside a `ScrollView` keyed
/// by stable feed ids so a streaming bubble mutates only its own row (no whole-
/// list invalidation) — the basis for smooth, 120fps-clean scrolling (PARITY §5).
///
/// Bottom-pinning is WhatsApp-grade: `.defaultScrollAnchor(.bottom)` keeps the
/// view glued to the newest content while the user sits at the bottom (including
/// during streaming growth); when they scroll up to read history a "scroll to
/// latest" affordance appears, and new content no longer yanks them down.
struct MissionFeed: View {
  let rows: [ChatRow]
  /// Bumped by the caller when the user sends, to force a scroll to the bottom
  /// even if they were reading history.
  var scrollToBottomSignal: Int

  @Environment(\.theme) private var theme
  @State private var atBottom = true
  private let bottomAnchor = "houston.chat.bottom"

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: Spacing.space10) {
          ForEach(rows) { row in
            FeedRow(row: row)
              .id(row.id)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          // Bottom sentinel: its visibility is the "am I at the bottom?" signal.
          Color.clear
            .frame(height: 1)
            .id(bottomAnchor)
            .onAppear { atBottom = true }
            .onDisappear { atBottom = false }
        }
        .padding(.horizontal, Spacing.space16)
        .padding(.vertical, Spacing.space12)
      }
      .defaultScrollAnchor(.bottom)
      .scrollDismissesKeyboard(.interactively)
      .overlay(alignment: .bottomTrailing) {
        if !atBottom {
          jumpButton { scroll(proxy, animated: true) }
            .padding(Spacing.space16)
            .transition(.scale.combined(with: .opacity))
        }
      }
      .animation(.smooth(duration: Motion.fast), value: atBottom)
      .onChange(of: rows.last?.id) { _, _ in
        if atBottom { scroll(proxy, animated: true) }
      }
      .onChange(of: scrollToBottomSignal) { _, _ in scroll(proxy, animated: true) }
    }
  }

  private func scroll(_ proxy: ScrollViewProxy, animated: Bool) {
    if animated {
      withAnimation(.smooth(duration: Motion.common)) { proxy.scrollTo(bottomAnchor, anchor: .bottom) }
    } else {
      proxy.scrollTo(bottomAnchor, anchor: .bottom)
    }
  }

  private func jumpButton(_ action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: "chevron.down")
        .font(Typography.label)
        .foregroundStyle(theme.foreground)
        .padding(Spacing.space10)
        .background(theme.card, in: Circle())
        .overlay(Circle().strokeBorder(theme.border, lineWidth: 1))
        .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
    }
    .accessibilityLabel(Strings.Chat.scrollToLatest)
  }
}
