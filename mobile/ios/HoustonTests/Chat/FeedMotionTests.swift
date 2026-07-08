import XCTest

@testable import Houston

/// The pure append-animation gate behind the mission feed's send/receive motion
/// (``FeedMotion``): appends animate ONLY after the first snapshot has loaded and
/// while the user is pinned to the bottom. No view — the decision is a total
/// function of two flags.
final class FeedMotionTests: XCTestCase {
  func testInitialLoadNeverAnimates() {
    // First snapshot (history hydration): loaded is still false, so even at the
    // bottom nothing slides.
    XCTAssertFalse(FeedMotion.animatesAppend(hasLoadedOnce: false, atBottom: true))
    XCTAssertFalse(FeedMotion.animatesAppend(hasLoadedOnce: false, atBottom: false))
  }

  func testAppendAnimatesOnlyWhenLoadedAndAtBottom() {
    XCTAssertTrue(
      FeedMotion.animatesAppend(hasLoadedOnce: true, atBottom: true),
      "a message sent/received while pinned to the bottom slides in")
  }

  func testReadingHistorySuppressesAppendAnimation() {
    XCTAssertFalse(
      FeedMotion.animatesAppend(hasLoadedOnce: true, atBottom: false),
      "content arriving while the user reads history must not yank the view")
  }
}
