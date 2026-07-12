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
  /// Feed ids whose optimistic user message the engine has not yet confirmed
  /// (`FeedItemVM.pending`), for the WhatsApp delivery tick (clock while present,
  /// check once cleared). Keyed like `timestamps` — by feed-entry / row id. Empty
  /// renders every bubble confirmed (older data, or before the seam is wired).
  var pendingIds: Set<String> = []
  /// Feed ids whose optimistic user message provably never reached the engine
  /// (`FeedItemVM.failed`), for the failed delivery tick — an error glyph instead
  /// of a check. Keyed like `pendingIds`; empty renders every bubble as sent or
  /// pending (older data, or nothing failed).
  var failedIds: Set<String> = []
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
  /// Flipped true once the first snapshot has rendered, so the initial history
  /// load never animates — only appends AFTER it slide in (``FeedMotion``).
  @State private var hasLoadedOnce = false

  private let bottomAnchor = "houston.chat.bottom"
  private let pendingAnchor = "houston.chat.pending"
  private let scrollSpace = "houston.chat.scroll"
  /// A separator within this many points of the viewport top counts as "current".
  private static let anchorTop = Spacing.space16

  private var timeline: [TimelineRow] {
    ChatTimeline.rows(
      from: rows, timestamps: timestamps, pendingIds: pendingIds, failedIds: failedIds)
  }

  /// Unread messages in the feed — folded process blocks don't count, so a turn
  /// increments the badge by one (``ChatRow/countsAsUnreadMessage``).
  private var unreadMessageCount: Int { rows.unreadMessageCount }

  var body: some View {
    ScrollViewReader { proxy in
      // Fold once and reuse for the rows and the append-animation key. Keying the
      // animation on the id set (not content) means a streaming text delta — same
      // ids — never re-transitions; only a genuine insertion does.
      let timeline = timeline
      let rowIDs = timeline.map(\.id)
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 0) {
          ForEach(timeline) { entry in
            timelineRow(entry)
              .transition(FeedMotion.rowTransition(reduceMotion: reduceMotion))
          }
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
        // Animate appends (send/receive slide-up) only once loaded and pinned to
        // the bottom; `nil` otherwise disables the transition (initial history
        // load, or content arriving while the user reads history).
        .animation(
          FeedMotion.animatesAppend(hasLoadedOnce: hasLoadedOnce, atBottom: atBottom)
            ? FeedMotion.appendSpring : nil,
          value: rowIDs)
      }
      .coordinateSpace(name: scrollSpace)
      .defaultScrollAnchor(.bottom)
      .scrollDismissesKeyboard(.interactively)
      .onPreferenceChange(DayAnchorsKey.self) { onAnchors($0) }
      .overlay(alignment: .top) { floatingPill }
      .overlay(alignment: .bottomTrailing) { jumpAffordance(proxy) }
      .animation(.smooth(duration: Motion.fast), value: atBottom)
      .animation(reduceMotion ? nil : .smooth(duration: Motion.fast), value: pill.isVisible)
      // Mark loaded after the FIRST render, whatever it contained (onChange fires
      // post-render, so content present on first appear — seeded history — never
      // transitions). Everything appended after that first render animates,
      // including the very first message of a chat that opened empty (a draft) —
      // gating on non-empty would drop that one entrance animation.
      .onChange(of: rows.isEmpty, initial: true) { _, _ in hasLoadedOnce = true }
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
      FeedRow(row: item.row, timestamp: item.ts, pending: item.pending, failed: item.failed)
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
        .foregroundStyle(theme.ink)
        .padding(Spacing.space10)
        .background(theme.card, in: Circle())
        .overlay(Circle().strokeBorder(theme.line, lineWidth: 1))
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
