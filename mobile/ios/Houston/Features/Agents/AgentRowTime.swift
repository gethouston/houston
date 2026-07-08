import Foundation

/// The right-aligned last-activity time label on an Agents-home contact row
/// (WhatsApp chat-list convention): today shows the short, locale-aware
/// wall-clock time ("14:32" / "2:32 PM"), yesterday the localized "Yesterday",
/// the previous six days the weekday name, and anything older a localized short
/// date.
///
/// Pure and dependency-light so every bucket unit-tests directly: inject a fixed
/// `now`, `calendar`, and `locale` to pin the branch. Buckets come from the
/// shared ``DayBucket`` classifier so the row stays in lockstep with the chat
/// timeline (``TimelineDayLabel``); only the rendering differs — the row wants
/// the wall-clock time today and a short date for older days, where the timeline
/// labels "Today" and falls back to a medium date. Reuses the wave-1
/// ``ChatBubbleTime`` short-time formatter and the `Strings.Chat.Timeline`
/// "Yesterday" copy.
enum AgentRowTime {
    static func label(
        for date: Date,
        now: Date = Date(),
        calendar: Calendar = .current,
        locale: Locale = .current
    ) -> String {
        switch DayBucket.of(date, now: now, calendar: calendar) {
        case .today:
            return ChatBubbleTime.label(for: date, locale: locale)
        case .yesterday:
            return Strings.Chat.Timeline.yesterday
        case .weekday(let start):
            return weekday(locale, calendar).string(from: start)
        case .older(let start):
            return shortDate(locale, calendar).string(from: start)
        }
    }

    // Formatters are cached for the production path (`.current` locale + calendar,
    // as every AgentRow render passes) so scrolling a home of older-activity rows
    // never allocates a DateFormatter per row per frame — matching the wave-1
    // ``TimelineDayLabel`` convention. An injected non-default locale/calendar
    // (tests) falls back to a fresh formatter, so testability is preserved.
    private static let cachedWeekday = makeWeekday(.current, .current)
    private static let cachedShortDate = makeShortDate(.current, .current)

    private static func isDefault(_ locale: Locale, _ calendar: Calendar) -> Bool {
        locale == .current && calendar == .current
    }

    private static func weekday(_ locale: Locale, _ calendar: Calendar) -> DateFormatter {
        isDefault(locale, calendar) ? cachedWeekday : makeWeekday(locale, calendar)
    }

    private static func shortDate(_ locale: Locale, _ calendar: Calendar) -> DateFormatter {
        isDefault(locale, calendar) ? cachedShortDate : makeShortDate(locale, calendar)
    }

    private static func makeWeekday(_ locale: Locale, _ calendar: Calendar) -> DateFormatter {
        let formatter = baseFormatter(locale, calendar)
        formatter.setLocalizedDateFormatFromTemplate("EEEE")
        return formatter
    }

    private static func makeShortDate(_ locale: Locale, _ calendar: Calendar) -> DateFormatter {
        let formatter = baseFormatter(locale, calendar)
        formatter.dateStyle = .short
        formatter.timeStyle = .none
        return formatter
    }

    /// A formatter pinned to the same calendar/timezone used for bucketing, so
    /// the rendered day matches the day the branch selected (and tests stay
    /// deterministic under an injected calendar).
    private static func baseFormatter(_ locale: Locale, _ calendar: Calendar) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        return formatter
    }
}
