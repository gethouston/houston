import XCTest

@testable import Houston

/// Pins the wire decode of a pending interaction and the board-status `done`
/// tolerance. The interaction shape mirrors `packages/protocol/src/domain/
/// interaction.ts`: an ordered `steps` array of tagged unions. An UNRECOGNISED
/// `kind` must decode to `.unknown` (render nothing) so a newer engine never
/// crashes the conversation decode, and `boardStatus: "done"` must decode safely
/// to the tolerant `.unknown` case (no title-bar status line).
final class InteractionModelTests: XCTestCase {
  private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
  }

  // MARK: - Step kinds

  func testDecodesQuestionStepWithOptions() throws {
    let step = try decode(
      InteractionStep.self,
      #"{"kind":"question","id":"q1","question":"Who is it for?","options":[{"id":"o1","label":"John"},{"id":"o2","label":"Jane"}]}"#)
    XCTAssertEqual(
      step,
      .question(
        id: "q1", question: "Who is it for?",
        options: [
          InteractionOption(id: "o1", label: "John"),
          InteractionOption(id: "o2", label: "Jane"),
        ]))
    XCTAssertTrue(step.isRenderable)
  }

  func testDecodesQuestionStepWithoutOptions() throws {
    // `options` is optional in the protocol — a free-text-only ask decodes to [].
    let step = try decode(
      InteractionStep.self, #"{"kind":"question","id":"q1","question":"What next?"}"#)
    XCTAssertEqual(step, .question(id: "q1", question: "What next?", options: []))
  }

  func testDecodesSigninStep() throws {
    XCTAssertEqual(
      try decode(InteractionStep.self, #"{"kind":"signin","id":"s1","reason":"Sign in first."}"#),
      .signin(id: "s1", reason: "Sign in first."))
    // reason is optional.
    XCTAssertEqual(
      try decode(InteractionStep.self, #"{"kind":"signin","id":"s1"}"#),
      .signin(id: "s1", reason: nil))
  }

  func testDecodesConnectStep() throws {
    XCTAssertEqual(
      try decode(
        InteractionStep.self,
        #"{"kind":"connect","id":"c1","toolkit":"Gmail","reason":"To send mail."}"#),
      .connect(id: "c1", toolkit: "Gmail", reason: "To send mail."))
  }

  func testDecodesPlanReadyStep() throws {
    XCTAssertEqual(
      try decode(
        InteractionStep.self, #"{"kind":"plan_ready","id":"p1","summary":"Plan\n- do it"}"#),
      .planReady(id: "p1", summary: "Plan\n- do it"))
  }

  func testUnknownKindDecodesToUnknownAndDoesNotRender() throws {
    let step = try decode(
      InteractionStep.self, #"{"kind":"teleport","id":"z1","target":"mars"}"#)
    XCTAssertEqual(step, .unknown(kind: "teleport"))
    XCTAssertFalse(step.isRenderable)
  }

  // MARK: - PendingInteraction

  func testDecodesFullSequenceAndDropsUnknownFromRenderable() throws {
    let json = #"""
    {"steps":[
      {"kind":"question","id":"q1","question":"Who?","options":[{"id":"o1","label":"John"}]},
      {"kind":"future","id":"f1"},
      {"kind":"signin","id":"s1"},
      {"kind":"connect","id":"c1","toolkit":"Gmail"},
      {"kind":"plan_ready","id":"p1","summary":"Plan"}
    ]}
    """#
    let interaction = try decode(PendingInteraction.self, json)
    XCTAssertEqual(interaction.steps.count, 5)
    // The unknown `future` step is dropped from the renderable walk.
    XCTAssertEqual(interaction.renderableSteps.count, 4)
    XCTAssertTrue(interaction.hasRenderableSteps)
  }

  func testMalformedKnownStepIsDroppedNotFatalToTheWholeInteraction() throws {
    // A `connect` step missing its required `toolkit` is structurally invalid.
    // It must be DROPPED (fail-soft) rather than throwing and taking the entire
    // interaction — and the conversation snapshot — down with it.
    let json = #"""
    {"steps":[
      {"kind":"question","id":"q1","question":"Who?","options":[{"id":"o1","label":"John"}]},
      {"kind":"connect","id":"c1"},
      {"kind":"plan_ready","id":"p1","summary":"Plan"}
    ]}
    """#
    let interaction = try decode(PendingInteraction.self, json)
    XCTAssertEqual(interaction.steps.count, 2, "the malformed connect step is dropped, not fatal")
    XCTAssertEqual(interaction.renderableSteps.count, 2)
    XCTAssertTrue(interaction.hasRenderableSteps)
  }

  func testMalformedOptionIsDroppedButQuestionSurvives() throws {
    // One option missing `label` must not blank the question — the surviving
    // options render (desktop never validates options).
    let step = try decode(
      InteractionStep.self,
      #"{"kind":"question","id":"q1","question":"Who?","options":[{"id":"o1","label":"John"},{"id":"o2"}]}"#)
    XCTAssertEqual(
      step, .question(id: "q1", question: "Who?", options: [InteractionOption(id: "o1", label: "John")]),
      "the malformed option is dropped; the question keeps the valid ones")
  }

  func testConversationVMSurvivesMalformedInteractionStep() throws {
    // The regression this guards: a bad known-kind step used to fail the whole
    // ConversationVM decode, freezing the feed on its last good state.
    let json = #"""
    {"feed":[],"running":false,"sessionStatus":"completed","boardStatus":"needs_you",
     "pendingInteraction":{"steps":[{"kind":"connect","id":"c1"}]}}
    """#
    let vm = try decode(ConversationVM.self, json)
    XCTAssertEqual(
      vm.pendingInteraction, PendingInteraction(steps: []),
      "the snapshot decodes; the unrenderable interaction is simply absent")
    XCTAssertFalse(vm.pendingInteraction?.hasRenderableSteps ?? true)
  }

  func testAllUnknownInteractionHasNoRenderableSteps() throws {
    let interaction = try decode(
      PendingInteraction.self, #"{"steps":[{"kind":"future","id":"f1"}]}"#)
    XCTAssertFalse(interaction.hasRenderableSteps)
    XCTAssertTrue(interaction.renderableSteps.isEmpty)
  }

  // MARK: - ConversationVM integration

  func testConversationVMDecodesPendingInteraction() throws {
    let json = #"""
    {"feed":[],"running":false,"sessionStatus":"completed","boardStatus":"needs_you",
     "pendingInteraction":{"steps":[{"kind":"question","id":"q1","question":"Who?"}]}}
    """#
    let vm = try decode(ConversationVM.self, json)
    XCTAssertEqual(
      vm.pendingInteraction,
      PendingInteraction(steps: [.question(id: "q1", question: "Who?", options: [])]))
  }

  func testConversationVMPendingInteractionAbsentIsNil() throws {
    let vm = try decode(
      ConversationVM.self,
      #"{"feed":[],"running":true,"sessionStatus":"running","boardStatus":"running"}"#)
    XCTAssertNil(vm.pendingInteraction)
  }

  // MARK: - boardStatus "done" tolerance

  func testBoardStatusDoneDecodesToUnknownAndStaysSafe() throws {
    let vm = try decode(
      ConversationVM.self,
      #"{"feed":[],"running":false,"sessionStatus":"completed","boardStatus":"done"}"#)
    // "done" is a terminal string the enum has no explicit case for: it tolerates
    // it via `.unknown`, never crashing the decode.
    XCTAssertEqual(vm.boardStatus, .unknown("done"))
    // The title bar shows NO second line for a done mission.
    XCTAssertEqual(
      ChatTitleStatus.derive(running: false, boardStatus: vm.boardStatus), .hidden)
    // MissionState stays safe (renders neutrally, off-board) rather than matching
    // a wrong column.
    XCTAssertEqual(
      MissionState.from(sessionStatus: .completed, boardStatus: vm.boardStatus),
      .unknown("done"))
  }
}
