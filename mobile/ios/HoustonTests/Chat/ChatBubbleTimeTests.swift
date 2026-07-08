import XCTest

@testable import Houston

/// The in-bubble timestamp helper + the pure geometry behind ``TimedBubbleLayout``
/// (WhatsApp convention). No UI — the formatter is locale-driven and the layout
/// math is exercised through its extracted, view-free resolver.
final class ChatBubbleTimeTests: XCTestCase {
  // A fixed instant: 2026-07-06 15:45:00 UTC.
  private let instant = Date(timeIntervalSince1970: 1_783_784_700)

  // MARK: Formatting

  func testShortenedTimeIs12HourInUS() {
    // Build the instant in the current time zone — `ChatBubbleTime` renders in the
    // device's local zone (a message shows the reader's wall-clock), so pinning
    // the source to UTC here would make the asserted hour machine-dependent.
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = .current
    let comps = DateComponents(
      calendar: cal, year: 2026, month: 7, day: 6, hour: 15, minute: 45)
    let date = cal.date(from: comps)!
    // en_US → 12-hour clock with an AM/PM marker.
    let label = ChatBubbleTime.label(for: date, locale: Locale(identifier: "en_US"))
    XCTAssertTrue(label.contains("3"))
    XCTAssertTrue(label.uppercased().contains("PM"))
    XCTAssertFalse(label.contains("15"))
  }

  func testShortenedTimeIs24HourInGB() {
    // Local time zone: the formatter renders in the device's zone (see the 12h
    // test), so the source instant must be pinned there to assert a fixed hour.
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = .current
    let comps = DateComponents(
      calendar: cal, year: 2026, month: 7, day: 6, hour: 15, minute: 45)
    let date = cal.date(from: comps)!
    // en_GB → 24-hour clock, no AM/PM marker.
    let label = ChatBubbleTime.label(for: date, locale: Locale(identifier: "en_GB"))
    XCTAssertTrue(label.contains("15"))
    XCTAssertFalse(label.uppercased().contains("PM"))
  }

  func testLabelIsStableForSameInstant() {
    let a = ChatBubbleTime.label(for: instant, locale: Locale(identifier: "en_US"))
    let b = ChatBubbleTime.label(for: instant, locale: Locale(identifier: "en_US"))
    XCTAssertEqual(a, b)
  }

  // MARK: Delivery tick selection

  func testSendingShowsClock() {
    XCTAssertEqual(ChatBubbleTick.symbolName(for: .sending), "clock")
  }

  func testSentShowsCheck() {
    XCTAssertEqual(ChatBubbleTick.symbolName(for: .sent), "checkmark")
  }

  func testFailedShowsErrorTick() {
    // A send that never landed reads as failed, NEVER a "Sent" check.
    XCTAssertEqual(ChatBubbleTick.symbolName(for: .failed), "exclamationmark")
  }

  func testDeliveryClassifiesFromFlags() {
    XCTAssertEqual(ChatDelivery(pending: true, failed: false), .sending)
    XCTAssertEqual(ChatDelivery(pending: false, failed: false), .sent)
    XCTAssertEqual(ChatDelivery(pending: false, failed: true), .failed)
    // Failed wins over a stale pending flag (the SDK strips pending on failure).
    XCTAssertEqual(ChatDelivery(pending: true, failed: true), .failed)
  }

  // MARK: Geometry — inline vs own line

  private func resolve(
    maxWidth: CGFloat, text: CGSize, reservedText: CGSize, time: CGSize
  ) -> TimedBubbleGeometry.Plan {
    TimedBubbleGeometry.resolve(
      maxWidth: maxWidth, text: text, reservedText: reservedText, time: time,
      hSpacing: 6, vSpacing: 2)
  }

  func testShortTextPlacesTimeInline() {
    // A short single line: reserving the strip keeps one line, so time is inline.
    let plan = resolve(
      maxWidth: 300, text: CGSize(width: 60, height: 22),
      reservedText: CGSize(width: 60, height: 22), time: CGSize(width: 44, height: 14))
    XCTAssertTrue(plan.inline)
    // Content-sized: text + gap + time.
    XCTAssertEqual(plan.size.width, 60 + 6 + 44, accuracy: 0.01)
    XCTAssertEqual(plan.size.height, 22, accuracy: 0.01)
  }

  func testFullBlockDropsTimeToOwnLine() {
    // Reserving the strip forces an extra line (44 vs 22) ⇒ own line.
    let plan = resolve(
      maxWidth: 300, text: CGSize(width: 300, height: 22),
      reservedText: CGSize(width: 250, height: 44), time: CGSize(width: 44, height: 14))
    XCTAssertFalse(plan.inline)
    XCTAssertEqual(plan.size.width, 300, accuracy: 0.01)
    // Text height + vSpacing + time height.
    XCTAssertEqual(plan.size.height, 22 + 2 + 14, accuracy: 0.01)
  }

  func testMultilineWithRoomStaysInline() {
    // Two lines whose widest line leaves room; reserving keeps two lines.
    let plan = resolve(
      maxWidth: 300, text: CGSize(width: 200, height: 44),
      reservedText: CGSize(width: 200, height: 44), time: CGSize(width: 44, height: 14))
    XCTAssertTrue(plan.inline)
    XCTAssertEqual(plan.size.width, 200 + 6 + 44, accuracy: 0.01)
    XCTAssertEqual(plan.size.height, 44, accuracy: 0.01)
  }

  func testInlineWidthNeverExceedsMaxWidth() {
    // Text nearly fills the width but still fits when reserved (same height):
    // the reported width clamps to maxWidth.
    let plan = resolve(
      maxWidth: 250, text: CGSize(width: 200, height: 22),
      reservedText: CGSize(width: 200, height: 22), time: CGSize(width: 44, height: 14))
    XCTAssertTrue(plan.inline)
    XCTAssertLessThanOrEqual(plan.size.width, 250)
  }

  func testUnboundedWidthIsAlwaysInline() {
    let plan = resolve(
      maxWidth: .infinity, text: CGSize(width: 500, height: 22),
      reservedText: CGSize(width: 500, height: 22), time: CGSize(width: 44, height: 14))
    XCTAssertTrue(plan.inline)
    XCTAssertEqual(plan.size.width, 500 + 6 + 44, accuracy: 0.01)
  }
}
