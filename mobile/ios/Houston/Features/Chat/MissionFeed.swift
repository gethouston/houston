import Combine
import SwiftUI
import UIKit

/// The scrolling mission transcript. A `LazyVStack` inside a `ScrollView` keyed
/// by stable ids (row id for items, start-of-day for separators) so a streaming
/// bubble mutates only its own row — no whole-list invalidation, no separator
/// re-identify (PARITY §5).
///
/// Bottom-pinning is WhatsApp-grade: `.defaultScrollAnchor(.bottom)` keeps the
/// view glued to the newest content while the user sits at the bottom (including
/// during streaming growth); when they scroll up to read history a "scroll to
/// latest" affordance appears (with an unread badge), new content no longer yanks
/// them down, and a floating date pill marks where they are. Day separators +
/// message grouping come from the pure ``ChatTimeline`` fold.
struct MissionFeed: View {
  let rows: [ChatRow]
  /// Wall-clock times keyed by ``ChatRow`` id (`ChatScreenModel.timestampsById`),
  /// powering day separators, grouping, and the floating pill. Empty renders a
  /// flat, separator-less feed (older data with no `ts`).
  var timestamps: [String: Date] = [:]
  /// Whether the pending-turn helmet slot renders below the last row (PARITY §1).
  var showPending: Bool = false
  /// Whether the pending slot's "Mission in progress..." label shows (PARITY §1).
  var showPendingLabel: Bool = false
  /// Bumped by the caller when the user sends, to force a scroll to the bottom
  /// even if they were reading history.
  var scrollToBottomSignal: Int

  @Environment(\.theme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var atBottom = true
  @State private var pill = FloatingDatePillModel()
  @State private var unread = UnreadCounter()
  @State private var topDay: Date?
  @State private var settleTask: Task<Void, Never>?

  private let bottomAnchor = "houston.chat.bottom"
  private let pendingAnchor = "houston.chat.pending"
  private let scrollSpace = "houston.chat.scroll"
  /// A separator within this many points of the viewport top counts as "current".
  private static let anchorTop = Spacing.space16

  private var timeline: [TimelineRow] {
    ChatTimeline.rows(from: rows, timestamps: timestamps)
  }

  /// Unread messages in the feed — folded process blocks don't count, so a turn
  /// increments the badge by one (``ChatRow/countsAsUnreadMessage``).
  private var unreadMessageCount: Int { rows.unreadMessageCount }

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          ForEach(timeline) { entry in timelineRow(entry) }
          if showPending {
            PendingTurnIndicator(showLabel: showPendingLabel)
              .id(pendingAnchor)
              .padding(.top, Spacing.space10)
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
      .coordinateSpace(name: scrollSpace)
      .defaultScrollAnchor(.bottom)
      .scrollDismissesKeyboard(.interactively)
      .onPreferenceChange(DayAnchorsKey.self) { onAnchors($0) }
      .overlay(alignment: .top) { floatingPill }
      .overlay(alignment: .bottomTrailing) { jumpAffordance(proxy) }
      .animation(.smooth(duration: Motion.fast), value: atBottom)
      .animation(reduceMotion ? nil : .smooth(duration: Motion.fast), value: pill.isVisible)
      .onChange(of: rows.last?.id) { _, _ in if atBottom { scroll(proxy, animated: true) } }
      .onChange(of: showPending) { _, _ in if atBottom { scroll(proxy, animated: true) } }
      .onChange(of: scrollToBottomSignal) { _, _ in scroll(proxy, animated: true) }
      .onChange(of: unreadMessageCount) { _, new in unread.update(messageCount: new, atBottom: atBottom) }
      .onChange(of: atBottom) { _, now in
        unread.update(messageCount: unreadMessageCount, atBottom: now)
        if now { pill.reachedBottom() }
      }
      // When the keyboard opens it steals the bottom of the viewport; re-pin to
      // the newest message so it clears the bar — but only if the user was already
      // at the bottom, so reading history is never yanked.
      .onReceive(
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
      ) { _ in
        if atBottom { scroll(proxy, animated: true) }
      }
    }
  }

  @ViewBuilder private func timelineRow(_ entry: TimelineRow) -> some View {
    switch entry {
    case let .daySeparator(day):
      DaySeparatorView(day: day).background(anchor(for: day))
    case let .item(item):
      FeedRow(row: item.row, timestamp: item.ts)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, item.groupedWithPrevious ? Spacing.space2 : Spacing.space10)
    }
  }

  /// Reports a separator's scroll-space position so the floating pill can pick
  /// the top day. Placed in the row background so it never affects layout.
  private func anchor(for day: Date) -> some View {
    GeometryReader { geo in
      Color.clear.preference(
        key: DayAnchorsKey.self,
        value: [DayAnchor(day: day, minY: geo.frame(in: .named(scrollSpace)).minY)])
    }
  }

  @ViewBuilder private var floatingPill: some View {
    if pill.isVisible, let topDay {
      FloatingDatePill(day: topDay).transition(.opacity)
    }
  }

  @ViewBuilder private func jumpAffordance(_ proxy: ScrollViewProxy) -> some View {
    if !atBottom {
      jumpButton { scroll(proxy, animated: true) }
        .padding(Spacing.space16)
        .transition(.scale.combined(with: .opacity))
    }
  }

  /// Separator positions changed — the user is scrolling. Update the top day, show
  /// the pill (unless at bottom), and debounce a hide ~1s after scrolling stops.
  private func onAnchors(_ anchors: [DayAnchor]) {
    topDay = TimelineDayTracker.topDay(anchors: anchors, top: Self.anchorTop)
    pill.scrolled(atBottom: atBottom)
    settleTask?.cancel()
    settleTask = Task { @MainActor in
      try? await Task.sleep(for: .seconds(1))
      if !Task.isCancelled { pill.settled() }
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
        .floatingChromeShadow()
    }
    .overlay(alignment: .topTrailing) {
      if unread.count > 0 {
        UnreadBadge(count: unread.count).offset(x: Spacing.space6, y: -Spacing.space6)
      }
    }
    .accessibilityLabel(Strings.Chat.scrollToLatest)
  }
}
