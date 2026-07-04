import XCTest

@testable import Houston

/// The client-side fallback title (PARITY §6), matching the desktop's
/// `fallbackMissionTitle` (`app/src/lib/mission-title-text.ts`).
final class MissionTitleTests: XCTestCase {
  func testEmptyBecomesNewMission() {
    XCTAssertEqual(MissionTitle.fallback(from: ""), "New mission")
    XCTAssertEqual(MissionTitle.fallback(from: "   \n  "), "New mission")
  }

  func testShortTextPassesThroughNormalized() {
    XCTAssertEqual(MissionTitle.fallback(from: "  fix the   bug "), "fix the bug")
  }

  func testExactlyFortyCharsUnchanged() {
    let forty = String(repeating: "a", count: 40)
    XCTAssertEqual(MissionTitle.fallback(from: forty), forty)
  }

  func testLongTextTruncatesOnWordBoundaryWithEllipsis() {
    let text = "Please summarize the quarterly financial report for the leadership team"
    let title = MissionTitle.fallback(from: text)
    XCTAssertTrue(title.hasSuffix("..."))
    XCTAssertLessThanOrEqual(title.count, 43) // ≤ 40 chars of content + "..."
    XCTAssertFalse(title.dropLast(3).hasSuffix(" ")) // trimmed at the word boundary
    XCTAssertTrue(text.hasPrefix(String(title.dropLast(3))))
  }

  func testSingleLongWordFallsBackToHardCut() {
    let word = String(repeating: "x", count: 60)
    let title = MissionTitle.fallback(from: word)
    XCTAssertEqual(title, String(repeating: "x", count: 40) + "...")
  }
}
