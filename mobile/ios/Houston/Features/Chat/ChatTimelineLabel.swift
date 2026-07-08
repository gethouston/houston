import Foundation

/// The human label for a day separator (WhatsApp/Telegram): "Today" / "Yesterday"
/// / a weekday name for the last six days / a localized medium date beyond that.
///
/// Pure and dependency-light so it unit-tests directly: pass a fixed `now` and
/// `calendar` to pin the branch. Buckets come from the shared ``DayBucket``
/// classifier (kept in lockstep with the Agents-home row); only the per-bucket
/// rendering — "Today"/"Yesterday" copy, weekday and medium formatting — is local.
enum TimelineDayLabel {
  static func label(for day: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
    switch DayBucket.of(day, now: now, calendar: calendar) {
    case .today: return Strings.Chat.Timeline.today
    case .yesterday: return Strings.Chat.Timeline.yesterday
    case .weekday(let start): return weekday.string(from: start)
    case .older(let start): return medium.string(from: start)
    }
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
