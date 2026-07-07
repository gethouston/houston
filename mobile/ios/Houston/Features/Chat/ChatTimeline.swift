import Foundation

/// One rendered row of the mission timeline: either a between-days separator or a
/// feed row with its time metadata. Day separators mark calendar-day boundaries
/// between dated rows (WhatsApp/Telegram); grouping tightens the gap between
/// consecutive quick user messages.
enum TimelineRow: Identifiable, Equatable {
  case daySeparator(Date)
  case item(TimelineItem)

  /// A stable id: the day's start-of-day epoch for separators, the row id for
  /// items — so streaming mutates one item in place and never re-identifies a
  /// separator (no layout jumps).
  var id: String {
    switch self {
    case let .daySeparator(day): return "day-\(Int(day.timeIntervalSince1970))"
    case let .item(item): return item.id
    }
  }
}

/// A feed row carried through the timeline with its wall-clock time (when known)
/// and whether it visually groups with the row above it.
struct TimelineItem: Identifiable, Equatable {
  let row: ChatRow
  /// The row's wall-clock time, or `nil` for rows the SDK could not attribute to
  /// a message (older data, dividers). Every consumer treats it as optional.
  let ts: Date?
  /// True when this and the previous rendered row are BOTH quick successive user
  /// messages (<= 60s apart, no separator between) — render them tightly stacked.
  let groupedWithPrevious: Bool

  var id: String { row.id }
}

/// Folds render-ready ``ChatRow``s into timeline rows: day separators at calendar
/// boundaries and grouping flags for quick user-message runs. Pure and total so
/// it unit-tests directly; timestamps arrive keyed by row id (a folded row's id
/// is its first feed entry's id, which carries the attributed `ts`).
enum ChatTimeline {
  /// Seconds within which two consecutive user messages group into one visual run.
  static let groupingWindow: TimeInterval = 60

  /// Insert a day separator before each dated row whose calendar day differs from
  /// the previous dated row's (and before the first dated row), and flag grouped
  /// user messages. Rows without a timestamp never trigger or receive a separator.
  static func rows(
    from rows: [ChatRow],
    timestamps: [String: Date],
    calendar: Calendar = .current
  ) -> [TimelineRow] {
    var result: [TimelineRow] = []
    var lastDay: Date?
    /// The previous rendered row's `ts` IFF it was a dated user message, else nil.
    var previousUserTs: Date?

    for row in rows {
      let ts = timestamps[row.id]
      var separatorInserted = false

      if let ts {
        let day = calendar.startOfDay(for: ts)
        if lastDay == nil || day != lastDay {
          result.append(.daySeparator(day))
          separatorInserted = true
        }
        lastDay = day
      }

      let grouped =
        !separatorInserted && isUserMessage(row)
        && groups(ts, with: previousUserTs)
      result.append(.item(TimelineItem(row: row, ts: ts, groupedWithPrevious: grouped)))

      previousUserTs = isUserMessage(row) ? ts : nil
    }
    return result
  }

  /// Both times present and within the grouping window.
  private static func groups(_ ts: Date?, with previous: Date?) -> Bool {
    guard let ts, let previous else { return false }
    return abs(ts.timeIntervalSince(previous)) <= groupingWindow
  }

  private static func isUserMessage(_ row: ChatRow) -> Bool {
    if case .user = row.kind { return true }
    return false
  }
}
