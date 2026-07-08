import XCTest
@testable import Houston

/// Pure-logic coverage for the WhatsApp chat-list row anatomy on the Agents home
/// (PARITY §4): the right-aligned time-label buckets (incl. 12/24h locale
/// behavior), the ISO `updatedAt` → `Date` derivation behind `lastActivityAt`,
/// the second-line preview selection (working vs. activity vs. none), and the
/// needs-you badge cap.
final class AgentRowTimeTests: XCTestCase {
    // A UTC Gregorian calendar so `startOfDay` bucketing is deterministic, and a
    // fixed "now" (Wed 2026-07-08 15:00 UTC) to pin every relative branch.
    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }
    private let now = DateComponents(
        calendar: Calendar(identifier: .gregorian),
        timeZone: TimeZone(identifier: "UTC"),
        year: 2026, month: 7, day: 8, hour: 15
    ).date!

    private func date(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 12) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    private func label(_ date: Date, locale: Locale = Locale(identifier: "en_US")) -> String {
        AgentRowTime.label(for: date, now: now, calendar: calendar, locale: locale)
    }

    // MARK: Time-label buckets

    func testTodayShowsShortTimeDelegatingToChatBubbleTime() {
        let today = date(2026, 7, 8, 9)
        let locale = Locale(identifier: "en_US")
        // The today bucket reuses the wave-1 short-time formatter verbatim.
        XCTAssertEqual(label(today, locale: locale), ChatBubbleTime.label(for: today, locale: locale))
    }

    func testTodayTimeRespectsLocaleClockPreference() {
        let today = date(2026, 7, 8, 9)
        let us = label(today, locale: Locale(identifier: "en_US")) // 12-hour → AM/PM
        let gb = label(today, locale: Locale(identifier: "en_GB")) // 24-hour → no AM/PM
        XCTAssertTrue(us.localizedCaseInsensitiveContains("AM") || us.localizedCaseInsensitiveContains("PM"))
        XCTAssertFalse(gb.localizedCaseInsensitiveContains("AM") || gb.localizedCaseInsensitiveContains("PM"))
    }

    func testYesterdayShowsLocalizedYesterday() {
        XCTAssertEqual(label(date(2026, 7, 7)), Strings.Chat.Timeline.yesterday)
    }

    func testWithinSixDaysShowsWeekdayName() {
        // 2026-07-05 is a Sunday; three days before the fixed Wednesday "now".
        XCTAssertEqual(label(date(2026, 7, 5)), "Sunday")
    }

    func testSixDaysAgoBoundaryStillShowsWeekday() {
        // Exactly six days back (2026-07-02, a Thursday) is the last weekday day.
        XCTAssertEqual(label(date(2026, 7, 2)), "Thursday")
    }

    func testOlderThanSixDaysShowsLocalizedShortDate() {
        // Seven days back (2026-07-01) falls out of the weekday window → short date.
        let older = date(2026, 7, 1)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.dateStyle = .short
        formatter.timeStyle = .none
        let expected = formatter.string(from: calendar.startOfDay(for: older))
        XCTAssertEqual(label(older), expected)
        // And it is not mistaken for a weekday or "Yesterday".
        XCTAssertNotEqual(label(older), Strings.Chat.Timeline.yesterday)
    }

    // MARK: lastActivityAt derivation (ISO → Date)

    func testLastActivityAtParsesPlainISO() {
        let overview = overview(last: last("2026-07-01T10:00:00Z"))
        XCTAssertEqual(overview.lastActivityAt, ActivityTimestamp.date(from: "2026-07-01T10:00:00Z"))
        XCTAssertNotNil(overview.lastActivityAt)
    }

    func testLastActivityAtParsesFractionalISO() {
        XCTAssertNotNil(overview(last: last("2026-07-01T10:00:00.123Z")).lastActivityAt)
    }

    func testLastActivityAtNilWhenTimestampMissing() {
        XCTAssertNil(overview(last: last(nil)).lastActivityAt)
    }

    func testLastActivityAtNilWhenTimestampUnparseable() {
        XCTAssertNil(overview(last: last("not-a-date")).lastActivityAt)
    }

    func testLastActivityAtNilWhenNoActivity() {
        XCTAssertNil(overview(last: nil).lastActivityAt)
    }

    // MARK: Preview selection

    func testRunningOnlyAgentPreviewsWorking() {
        let preview = AgentRowPreview.derive(overview(last: last("2026-07-08T10:00:00Z"), running: 1))
        XCTAssertEqual(preview, .working)
        XCTAssertTrue(preview.isWorking)
        XCTAssertEqual(preview.text, Strings.Chat.TitleBar.working)
    }

    func testNeedsYouAgentKeepsActivityPreview() {
        // needs_you wins over running: the row keeps its product-voice line.
        let preview = AgentRowPreview.derive(
            overview(last: last("2026-07-08T10:00:00Z", state: .needsYou, title: "Taxes"),
                     needsYou: 1, running: 1)
        )
        XCTAssertEqual(preview, .activity(.needsYou, "Taxes"))
        XCTAssertFalse(preview.isWorking)
        XCTAssertEqual(preview.text, Strings.Agents.lastActivity(state: .needsYou, title: "Taxes"))
    }

    func testIdleAgentPreviewsLastActivity() {
        let preview = AgentRowPreview.derive(
            overview(last: last("2026-07-01T10:00:00Z", state: .done, title: "Report"))
        )
        XCTAssertEqual(preview, .activity(.done, "Report"))
    }

    func testEmptyAgentPreviewsNoActivity() {
        let preview = AgentRowPreview.derive(overview(last: nil))
        XCTAssertEqual(preview, AgentRowPreview.none)
        XCTAssertEqual(preview.text, Strings.Agents.noActivity)
    }

    // MARK: Badge cap (NeedsYouChip count semantics)

    func testNeedsYouBadgeCapsAt99Plus() {
        XCTAssertEqual(Strings.cappedCount(1), "1")
        XCTAssertEqual(Strings.cappedCount(99), "99")
        XCTAssertEqual(Strings.cappedCount(100), "99+")
        XCTAssertEqual(Strings.cappedCount(1000), "99+")
    }

    // MARK: Builders

    private func overview(last activity: LastActivity?, needsYou: Int = 0, running: Int = 0) -> AgentOverview {
        AgentOverview(
            id: "a",
            name: "A",
            colorHex: nil,
            summary: AgentActivitySummary(needsYouCount: needsYou, runningCount: running),
            lastActivity: activity
        )
    }

    private func last(_ iso: String?, state: MissionState = .done, title: String = "T") -> LastActivity {
        LastActivity(title: title, state: state, updatedAt: iso)
    }
}
