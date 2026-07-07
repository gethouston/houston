import SwiftUI

/// Pure show/hide decision for the floating date pill. Visible while the user is
/// actively scrolling through history and NOT pinned to the bottom; hidden once
/// scrolling settles or the bottom is reached. Extracted so the state machine
/// unit-tests without any view (the view only drives it + debounces `settled`).
struct FloatingDatePillModel: Equatable {
  private(set) var isVisible = false

  /// A scroll movement happened: show the pill unless the user is at the bottom.
  mutating func scrolled(atBottom: Bool) { isVisible = !atBottom }

  /// Scrolling settled (the debounce elapsed) — fade the pill out.
  mutating func settled() { isVisible = false }

  /// Returning to the bottom hides the pill immediately.
  mutating func reachedBottom() { isVisible = false }
}

/// Counts unread MESSAGES that arrive while the user is scrolled away from the
/// bottom, for the scroll-to-latest button's unread badge. A message is a
/// discrete bubble/card, not a folded row: a normal turn (a process block plus
/// its reply) is ONE message, so the badge matches WhatsApp instead of climbing
/// per folded row (see ``ChatRow/countsAsUnreadMessage``). New messages while
/// away increment it; returning to the bottom clears it the instant it happens.
struct UnreadCounter: Equatable {
  private(set) var count = 0
  private var lastMessageCount = 0
  /// The first observation only establishes the baseline — the messages already
  /// on screen when the counter starts are what the user is looking at, not unread.
  private var seeded = false

  /// Feed the latest unread-message count and whether the user is at bottom.
  mutating func update(messageCount: Int, atBottom: Bool) {
    defer {
      lastMessageCount = messageCount
      seeded = true
    }
    if atBottom {
      count = 0
    } else if seeded, messageCount > lastMessageCount {
      count += messageCount - lastMessageCount
    }
  }
}

/// A day separator's vertical position within the scroll content (scroll-space
/// `minY`), used to pick the day currently at the top of the viewport.
struct DayAnchor: Equatable {
  let day: Date
  let minY: CGFloat
}

enum TimelineDayTracker {
  /// The day whose separator sits at or above the viewport top — the day of the
  /// content the user is looking at. Picks the lowest separator that has already
  /// scrolled to/past `top`; before any has, the topmost separator.
  static func topDay(anchors: [DayAnchor], top: CGFloat) -> Date? {
    let sorted = anchors.sorted { $0.minY < $1.minY }
    let passed = sorted.last { $0.minY <= top }
    return (passed ?? sorted.first)?.day
  }
}

/// Collects day-separator positions so the floating pill can track the top day.
struct DayAnchorsKey: PreferenceKey {
  static let defaultValue: [DayAnchor] = []
  static func reduce(value: inout [DayAnchor], nextValue: () -> [DayAnchor]) {
    value.append(contentsOf: nextValue())
  }
}
