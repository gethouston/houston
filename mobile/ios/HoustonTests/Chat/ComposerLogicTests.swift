import XCTest

@testable import Houston

/// Pins the composer's pure send-state + placeholder derivation so the WhatsApp-
/// style input bar's enablement never regresses: whitespace never sends, a
/// running turn always offers Stop, and the placeholder follows conversation age.
final class ComposerLogicTests: XCTestCase {
  // MARK: hasContent

  func testWhitespaceAndNewlinesAreNotContent() {
    XCTAssertFalse(ComposerLogic.hasContent(""))
    XCTAssertFalse(ComposerLogic.hasContent("   "))
    XCTAssertFalse(ComposerLogic.hasContent("\n\n"))
    XCTAssertFalse(ComposerLogic.hasContent(" \t\n "))
  }

  func testTrimmedTextIsContent() {
    XCTAssertTrue(ComposerLogic.hasContent("hi"))
    XCTAssertTrue(ComposerLogic.hasContent("  hi  "))
  }

  // MARK: action

  func testIdleEmptyIsDisabled() {
    XCTAssertEqual(ComposerLogic.action(text: "  ", isRunning: false), .disabled)
  }

  func testIdleWithTextSends() {
    XCTAssertEqual(ComposerLogic.action(text: "go", isRunning: false), .send)
  }

  func testRunningAlwaysStops() {
    XCTAssertEqual(ComposerLogic.action(text: "", isRunning: true), .stop)
    XCTAssertEqual(ComposerLogic.action(text: "typed", isRunning: true), .stop)
  }

  // MARK: isActive (button drawn full-size + interactive)

  func testActiveOnlyWhenSendableOrRunning() {
    XCTAssertFalse(ComposerLogic.isActive(text: "", isRunning: false))
    XCTAssertTrue(ComposerLogic.isActive(text: "x", isRunning: false))
    XCTAssertTrue(ComposerLogic.isActive(text: "", isRunning: true))
  }

  // MARK: placeholder

  func testFreshConversationInvitesFirstMission() {
    XCTAssertEqual(
      ComposerLogic.placeholder(hasUserMessage: false), Strings.Chat.newMissionPlaceholder)
  }

  func testOngoingConversationReadsLikeAMessenger() {
    XCTAssertEqual(
      ComposerLogic.placeholder(hasUserMessage: true), Strings.Chat.followUpPlaceholder)
    XCTAssertEqual(Strings.Chat.followUpPlaceholder, "Message")
  }
}
