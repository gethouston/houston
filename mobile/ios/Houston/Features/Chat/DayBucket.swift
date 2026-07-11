import Foundation

/// The WhatsApp/Telegram relative-day bucket a timestamp falls into, classified
/// against a reference `now`: today, yesterday, one of the previous six days, or
/// older. Shared by the chat day-separator label (``TimelineDayLabel``) and the
/// Agents-home row time (``AgentRowTime``) so the two can NEVER drift on where a
/// boundary sits — each renders its own copy from the same buckets, but the
/// classification (start-of-day comparisons, the yesterday check, the six-day
/// window) lives here once.
///
/// Pure and dependency-light so it unit-tests directly: inject a fixed `now` and
/// `calendar` to pin the branch. `weekday` and `older` carry the timestamp's
/// start-of-day so a caller formats the exact day the branch selected.
enum DayBucket: Equatable {
  case today
  case yesterday
  /// Within the previous six days (exclusive of today) — carries start-of-day.
  case weekday(Date)
  /// Older than six days — carries start-of-day.
  case older(Date)

  static func of(_ date: Date, now: Date, calendar: Calendar) -> DayBucket {
    let start = calendar.startOfDay(for: date)
    let today = calendar.startOfDay(for: now)

    if start == today { return .today }
    if let yesterday = calendar.date(byAdding: .day, value: -1, to: today), start == yesterday {
      return .yesterday
    }
    if let sixDaysAgo = calendar.date(byAdding: .day, value: -6, to: today),
      start >= sixDaysAgo, start < today {
      return .weekday(start)
    }
    return .older(start)
  }
}
