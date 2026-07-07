import XCTest

@testable import Houston

/// The timeline structure layer: the pure ``ChatTimeline`` fold (day separators +
/// message grouping), the ``TimelineDayLabel`` copy, the floating-pill state
/// machine, the unread counter, the top-day tracker, and `FeedItemVM.ts` decode.
final class ChatTimelineTests: XCTestCase {
  private func utc() -> Calendar {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    return cal
  }

  private func date(_ iso: String) -> Date {
    ISO8601DateFormatter().date(from: iso)!
  }

  private func user(_ id: String) -> ChatRow { ChatRow(id: id, kind: .user(text: "hi", author: nil)) }
  private func assistant(_ id: String) -> ChatRow {
    ChatRow(id: id, kind: .assistant(text: "ok", streaming: false))
  }

  // MARK: day separators

  func testFirstDatedRowGetsLeadingSeparator() {
    let rows = [user("u1"), user("u2")]
    let ts = ["u1": date("2024-01-15T10:00:00Z"), "u2": date("2024-01-15T10:00:20Z")]
    let timeline = ChatTimeline.rows(from: rows, timestamps: ts, calendar: utc())
    let separators = timeline.filter { if case .daySeparator = $0 { return true }; return false }
    XCTAssertEqual(separators.count, 1, "one leading separator for a single day")
    guard case .daySeparator = timeline.first else { return XCTFail("separator leads the timeline") }
    XCTAssertEqual(timeline.count, 3, "separator + two items")
  }

  func testDayBoundaryInsertsSeparator() {
    let rows = [user("u1"), user("u2")]
    let ts = ["u1": date("2024-01-15T23:30:00Z"), "u2": date("2024-01-16T00:10:00Z")]
    let timeline = ChatTimeline.rows(from: rows, timestamps: ts, calendar: utc())
    let separators = timeline.filter { if case .daySeparator = $0 { return true }; return false }
    XCTAssertEqual(separators.count, 2, "a separator per calendar day")
  }

  func testNilTsRowsNeverGetSeparators() {
    let timeline = ChatTimeline.rows(from: [user("u1"), assistant("a1")], timestamps: [:], calendar: utc())
    XCTAssertFalse(timeline.contains { if case .daySeparator = $0 { return true }; return false })
    XCTAssertEqual(timeline.count, 2, "just the two items, no separators")
  }

  func testNilTsRowBetweenDatedRowsGetsNoSeparatorAroundIt() {
    let rows = [user("u1"), assistant("a1"), user("u2")]
    let ts = ["u1": date("2024-01-15T10:00:00Z"), "u2": date("2024-01-15T10:00:05Z")]
    let timeline = ChatTimeline.rows(from: rows, timestamps: ts, calendar: utc())
    let separators = timeline.filter { if case .daySeparator = $0 { return true }; return false }
    XCTAssertEqual(separators.count, 1, "same-day dated rows keep a single leading separator")
  }

  // MARK: grouping

  private func grouped(_ timeline: [TimelineRow]) -> [Bool] {
    timeline.compactMap { if case let .item(item) = $0 { return item.groupedWithPrevious }; return nil }
  }

  func testConsecutiveUserMessagesWithinWindowGroup() {
    let rows = [user("u1"), user("u2")]
    let ts = ["u1": date("2024-01-15T10:00:00Z"), "u2": date("2024-01-15T10:00:30Z")]
    XCTAssertEqual(
      grouped(ChatTimeline.rows(from: rows, timestamps: ts, calendar: utc())),
      [false, true], "the second quick user message groups with the first")
  }

  func testUserMessagesBeyondWindowDoNotGroup() {
    let rows = [user("u1"), user("u2")]
    let ts = ["u1": date("2024-01-15T10:00:00Z"), "u2": date("2024-01-15T10:05:00Z")]
    XCTAssertEqual(grouped(ChatTimeline.rows(from: rows, timestamps: ts, calendar: utc())), [false, false])
  }

  func testNonUserRowBreaksGrouping() {
    let rows = [user("u1"), assistant("a1"), user("u2")]
    let ts = [
      "u1": date("2024-01-15T10:00:00Z"), "a1": date("2024-01-15T10:00:10Z"),
      "u2": date("2024-01-15T10:00:20Z"),
    ]
    XCTAssertEqual(
      grouped(ChatTimeline.rows(from: rows, timestamps: ts, calendar: utc())),
      [false, false, false], "an assistant row between two user messages breaks the run")
  }

  func testGroupingNeverCrossesADaySeparator() {
    let rows = [user("u1"), user("u2")]
    let ts = ["u1": date("2024-01-15T23:59:40Z"), "u2": date("2024-01-16T00:00:10Z")]
    // Within 60s in wall time, but a day boundary sits between them.
    XCTAssertEqual(grouped(ChatTimeline.rows(from: rows, timestamps: ts, calendar: utc())), [false, false])
  }

  func testUserMessageWithoutTimestampNeverGroups() {
    let rows = [user("u1"), user("u2")]
    let ts = ["u1": date("2024-01-15T10:00:00Z")]  // u2 has no ts
    XCTAssertEqual(grouped(ChatTimeline.rows(from: rows, timestamps: ts, calendar: utc())), [false, false])
  }

  func testItemIdIsRowIdAndSeparatorIdIsStablePerDay() {
    let ts = ["u1": date("2024-01-15T10:00:00Z")]
    let timeline = ChatTimeline.rows(from: [user("u1")], timestamps: ts, calendar: utc())
    XCTAssertEqual(timeline.last?.id, "u1", "an item keeps its stable row id")
    let again = ChatTimeline.rows(from: [user("u1")], timestamps: ts, calendar: utc())
    XCTAssertEqual(timeline.first?.id, again.first?.id, "the separator id is stable across folds")
  }

  // MARK: day label

  func testTodayAndYesterdayLabels() {
    let cal = Calendar.current
    let now = date("2024-06-15T12:00:00Z")
    XCTAssertEqual(TimelineDayLabel.label(for: now, now: now, calendar: cal), Strings.Chat.Timeline.today)
    let yesterday = cal.date(byAdding: .day, value: -1, to: now)!
    XCTAssertEqual(
      TimelineDayLabel.label(for: yesterday, now: now, calendar: cal), Strings.Chat.Timeline.yesterday)
  }

  func testWeekdayLabelWithinLastSixDays() {
    let cal = Calendar.current
    let now = date("2024-06-15T12:00:00Z")
    let threeAgo = cal.date(byAdding: .day, value: -3, to: now)!
    let weekday = DateFormatter()
    weekday.setLocalizedDateFormatFromTemplate("EEEE")
    XCTAssertEqual(
      TimelineDayLabel.label(for: threeAgo, now: now, calendar: cal),
      weekday.string(from: cal.startOfDay(for: threeAgo)))
  }

  func testMediumDateLabelBeyondSixDays() {
    let cal = Calendar.current
    let now = date("2024-06-15T12:00:00Z")
    let tenAgo = cal.date(byAdding: .day, value: -10, to: now)!
    let medium = DateFormatter()
    medium.dateStyle = .medium
    medium.timeStyle = .none
    XCTAssertEqual(
      TimelineDayLabel.label(for: tenAgo, now: now, calendar: cal),
      medium.string(from: cal.startOfDay(for: tenAgo)))
  }

  // MARK: floating pill state machine

  func testFloatingPillShowsOnlyWhenScrollingAwayFromBottom() {
    var pill = FloatingDatePillModel()
    XCTAssertFalse(pill.isVisible)
    pill.scrolled(atBottom: false)
    XCTAssertTrue(pill.isVisible, "scrolling through history shows the pill")
    pill.scrolled(atBottom: true)
    XCTAssertFalse(pill.isVisible, "scrolling while pinned to the bottom hides it")
  }

  func testFloatingPillHidesOnSettleAndOnReachingBottom() {
    var pill = FloatingDatePillModel()
    pill.scrolled(atBottom: false)
    pill.settled()
    XCTAssertFalse(pill.isVisible, "the pill fades out once scrolling settles")
    pill.scrolled(atBottom: false)
    pill.reachedBottom()
    XCTAssertFalse(pill.isVisible, "reaching the bottom hides it immediately")
  }

  // MARK: unread counter

  func testUnreadCountsMessagesAppendedWhileAwayAndResetsAtBottom() {
    var counter = UnreadCounter()
    counter.update(messageCount: 5, atBottom: true)
    XCTAssertEqual(counter.count, 0, "at the bottom there is nothing unread")
    counter.update(messageCount: 7, atBottom: false)
    XCTAssertEqual(counter.count, 2, "two messages arrived while scrolled up")
    counter.update(messageCount: 8, atBottom: false)
    XCTAssertEqual(counter.count, 3)
    counter.update(messageCount: 8, atBottom: true)
    XCTAssertEqual(counter.count, 0, "returning to the bottom clears the badge")
  }

  func testUnreadIgnoresStableMessageCountWhileAway() {
    var counter = UnreadCounter()
    counter.update(messageCount: 4, atBottom: false)
    counter.update(messageCount: 4, atBottom: false)  // a streaming message mutates in place
    XCTAssertEqual(counter.count, 0, "a message updating in place is not a new unread message")
  }

  // MARK: top-day tracker

  func testTopDayPicksLastSeparatorPastTheTop() {
    let d1 = date("2024-01-15T00:00:00Z")
    let d2 = date("2024-01-16T00:00:00Z")
    let anchors = [DayAnchor(day: d1, minY: -200), DayAnchor(day: d2, minY: -20)]
    XCTAssertEqual(
      TimelineDayTracker.topDay(anchors: anchors, top: 16), d2,
      "the most-recently-passed separator is the current day")
  }

  func testTopDayFallsBackToTopmostBeforeAnyPassed() {
    let d1 = date("2024-01-15T00:00:00Z")
    let anchors = [DayAnchor(day: d1, minY: 120)]
    XCTAssertEqual(TimelineDayTracker.topDay(anchors: anchors, top: 16), d1)
    XCTAssertNil(TimelineDayTracker.topDay(anchors: [], top: 16))
  }

  // MARK: ts decode

  func testFeedItemDecodesEpochMillisTimestamp() throws {
    let json = """
      {"feed":[{"id":"f0","feed_type":"assistant_text","data":"hi","ts":1705312800000}],
       "running":false,"sessionStatus":"completed"}
      """
    let vm = try BridgeTestJSON.decode(ConversationVM.self, json)
    XCTAssertEqual(vm.feed.first?.ts, Date(timeIntervalSince1970: 1_705_312_800))
  }

  func testFeedItemTimestampAbsentStaysNil() throws {
    let json = """
      {"feed":[{"id":"f0","feed_type":"assistant_text","data":"hi"}],
       "running":false,"sessionStatus":"completed"}
      """
    let vm = try BridgeTestJSON.decode(ConversationVM.self, json)
    XCTAssertNil(vm.feed.first?.ts, "older data without ts decodes to nil")
  }
}
