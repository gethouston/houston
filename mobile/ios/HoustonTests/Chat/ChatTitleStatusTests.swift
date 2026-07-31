import XCTest

@testable import Houston

/// Pins the chat title bar's second-line derivation (PARITY §1): a running turn
/// shows "working…", a mission settled on a BLOCKING step asks for attention,
/// and everything else hides the line.
///
/// The trigger is the pending interaction, never the board status. Missions no
/// longer auto-route to `done` — every clean finish settles `needs_you` and only
/// the user's checkmark closes one — so keying off `needsYou` would leave a
/// permanent "needs your attention" line on every finished conversation.
final class ChatTitleStatusTests: XCTestCase {
  private let question = InteractionStep.question(id: "q1", question: "Who?", options: [])
  /// An offer carries no demand; iOS has no UI for it yet, so it decodes `.unknown`.
  private let offer = InteractionStep.unknown(kind: "suggest_actions")

  func testRunningIsWorking() {
    XCTAssertEqual(ChatTitleStatus.derive(running: true, pendingInteraction: nil), .working)
  }

  func testRunningWinsOverAPendingInteraction() {
    // A live turn dominates even if the last settled turn left a question open.
    XCTAssertEqual(
      ChatTitleStatus.derive(
        running: true, pendingInteraction: PendingInteraction(steps: [question])),
      .working)
  }

  func testSettledOnABlockingStepAsksForAttention() {
    XCTAssertEqual(
      ChatTitleStatus.derive(
        running: false, pendingInteraction: PendingInteraction(steps: [question])),
      .needsAttention)
  }

  func testPlainlyFinishedHidesTheLine() {
    // The mission finished with nothing outstanding — it is waiting to be closed,
    // which is not something to nag about under the agent's name.
    XCTAssertEqual(ChatTitleStatus.derive(running: false, pendingInteraction: nil), .hidden)
  }

  func testFinishedWithOffersHidesTheLine() {
    XCTAssertEqual(
      ChatTitleStatus.derive(
        running: false, pendingInteraction: PendingInteraction(steps: [offer])),
      .hidden)
  }

  func testMixedStepsAskForAttentionWhenAnythingBlocks() {
    XCTAssertEqual(
      ChatTitleStatus.derive(
        running: false, pendingInteraction: PendingInteraction(steps: [offer, question])),
      .needsAttention)
  }

  func testEmptyInteractionHidesTheLine() {
    XCTAssertEqual(
      ChatTitleStatus.derive(running: false, pendingInteraction: PendingInteraction(steps: [])),
      .hidden)
  }
}
