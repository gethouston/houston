import XCTest

@testable import Houston

/// Pins the chat title bar's second-line derivation (PARITY §1): a running turn
/// shows "working…", a settled `needs_you` mission asks for attention, and every
/// other pair hides the line. `boardStatus` is authoritative once settled — a
/// user Stop lands as `needsYou`, an `error` shows nothing here (the feed's typed
/// error card is that surface).
final class ChatTitleStatusTests: XCTestCase {
  func testRunningIsWorking() {
    XCTAssertEqual(ChatTitleStatus.derive(running: true, boardStatus: nil), .working)
  }

  func testRunningWinsOverBoardStatus() {
    // A live turn dominates even if the last persisted board status was needsYou.
    XCTAssertEqual(
      ChatTitleStatus.derive(running: true, boardStatus: .needsYou), .working)
  }

  func testSettledNeedsYouAsksForAttention() {
    XCTAssertEqual(
      ChatTitleStatus.derive(running: false, boardStatus: .needsYou), .needsAttention)
  }

  func testSettledErrorHidesTheLine() {
    // A real failure surfaces as the feed's error card, not the title line.
    XCTAssertEqual(ChatTitleStatus.derive(running: false, boardStatus: .error), .hidden)
  }

  func testSettledRunningBoardStatusHidesTheLine() {
    XCTAssertEqual(ChatTitleStatus.derive(running: false, boardStatus: .running), .hidden)
  }

  func testNoBoardStatusHidesTheLine() {
    XCTAssertEqual(ChatTitleStatus.derive(running: false, boardStatus: nil), .hidden)
  }

  func testUnknownBoardStatusHidesTheLine() {
    XCTAssertEqual(
      ChatTitleStatus.derive(running: false, boardStatus: .unknown("queued")), .hidden)
  }
}
