import Foundation

/// The human label for a day separator (WhatsApp/Telegram): "Today" / "Yesterday"
/// / a weekday name for the last six days / a localized medium date beyond that.
///
/// Pure and dependency-light so it unit-tests directly: pass a fixed `now` and
/// `calendar` to pin the branch. Weekday and medium formatting stay localized.
enum TimelineDayLabel {
  static func label(for day: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
    let start = calendar.startOfDay(for: day)
    let today = calendar.startOfDay(for: now)

    if start == today { return Strings.Chat.Timeline.today }
    if let yesterday = calendar.date(byAdding: .day, value: -1, to: today), start == yesterday {
      return Strings.Chat.Timeline.yesterday
    }
    if let sixDaysAgo = calendar.date(byAdding: .day, value: -6, to: today),
      start >= sixDaysAgo, start < today {
      return weekday.string(from: start)
    }
    return medium.string(from: start)
  }

  private static let weekday: DateFormatter = {
    let formatter = DateFormatter()
    formatter.setLocalizedDateFormatFromTemplate("EEEE")
    return formatter
  }()

  private static let medium: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .none
    return formatter
  }()
}
