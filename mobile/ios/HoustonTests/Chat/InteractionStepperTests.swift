import XCTest

@testable import Houston

/// Pins the interaction stepper's pure cursor and the answer-text composition.
/// The composition fixtures are copied from desktop's `interaction-reply.test.ts`
/// / `interaction-card.test.ts` so a picked option sends EXACTLY the string
/// desktop would (`"<question>: <label>"`), and the cursor advances only for
/// signin/connect steps (a question answer sends and tears the card down instead).
final class InteractionStepperTests: XCTestCase {
  private let q1 = InteractionStep.question(
    id: "q1", question: "Who is it for?",
    options: [InteractionOption(id: "o1", label: "John"), InteractionOption(id: "o2", label: "Jane")])
  private let signin = InteractionStep.signin(id: "s1", reason: nil)
  private let connect = InteractionStep.connect(id: "c1", toolkit: "Gmail", reason: nil)

  // MARK: - Cursor

  func testSingleStepHidesProgressAndCannotAdvance() {
    let stepper = InteractionStepper(PendingInteraction(steps: [q1]))
    XCTAssertEqual(stepper.count, 1)
    XCTAssertFalse(stepper.showsProgress)
    XCTAssertFalse(stepper.canAdvance)
    XCTAssertEqual(stepper.current, q1)
  }

  func testWalksSigninThenConnect() {
    var stepper = InteractionStepper(PendingInteraction(steps: [signin, connect]))
    XCTAssertTrue(stepper.showsProgress)
    XCTAssertEqual(stepper.current, signin)
    XCTAssertEqual(stepper.progress.current, 1)
    XCTAssertEqual(stepper.progress.total, 2)
    XCTAssertTrue(stepper.canAdvance)

    stepper.advance()
    XCTAssertEqual(stepper.current, connect)
    XCTAssertEqual(stepper.progress.current, 2)
    XCTAssertFalse(stepper.canAdvance)

    // Advancing off the last step is a no-op — nowhere to go.
    stepper.advance()
    XCTAssertEqual(stepper.current, connect)
  }

  func testMultiQuestionAccumulatesAllAnswersIntoOneCombinedReply() {
    // A 3-question ask: each pick commits + advances; the LAST pick composes the
    // combined "Q1: a\nQ2: b\nQ3: c" body (desktop parity), never dropping Q2/Q3.
    let q2 = InteractionStep.question(
      id: "q2", question: "How urgent?",
      options: [InteractionOption(id: "u1", label: "Now"), InteractionOption(id: "u2", label: "Later")])
    let q3 = InteractionStep.question(
      id: "q3", question: "Which channel?",
      options: [InteractionOption(id: "c1", label: "Email")])
    var stepper = InteractionStepper(PendingInteraction(steps: [q1, q2, q3]))

    XCTAssertFalse(stepper.isLastStep, "on q1 of 3: answering advances, not sends")
    stepper.commit(answer: "John")
    stepper.advance()
    XCTAssertEqual(stepper.current, q2)
    XCTAssertFalse(stepper.isLastStep)

    stepper.commit(answer: "Now")
    stepper.advance()
    XCTAssertEqual(stepper.current, q3)
    XCTAssertTrue(stepper.isLastStep, "q3 is the last step: answering it sends")

    stepper.commit(answer: "Email")
    XCTAssertEqual(
      stepper.combinedReply,
      "Who is it for?: John\nHow urgent?: Now\nWhich channel?: Email",
      "every question's answer is sent in one combined body, matching desktop")
  }

  func testSingleQuestionCombinedReplyIsThatOneLine() {
    var stepper = InteractionStepper(PendingInteraction(steps: [q1]))
    XCTAssertTrue(stepper.isLastStep)
    stepper.commit(answer: "Jane")
    XCTAssertEqual(stepper.combinedReply, "Who is it for?: Jane")
  }

  func testCommitIgnoresNonQuestionStep() {
    var stepper = InteractionStepper(PendingInteraction(steps: [signin, connect]))
    stepper.commit(answer: "noop")
    XCTAssertTrue(stepper.combinedReply.isEmpty, "signin/connect steps contribute no answer line")
  }

  func testCursorSkipsUnknownSteps() {
    // An unknown leading step is dropped from the renderable walk, so the cursor
    // starts on the first RENDERABLE step and never lands on a blank.
    let stepper = InteractionStepper(
      PendingInteraction(steps: [.unknown(kind: "future"), q1]))
    XCTAssertEqual(stepper.count, 1)
    XCTAssertEqual(stepper.current, q1)
  }

  func testAllUnknownYieldsNoCurrentStep() {
    let stepper = InteractionStepper(PendingInteraction(steps: [.unknown(kind: "future")]))
    XCTAssertNil(stepper.current)
  }

  // MARK: - Answer-text composition (desktop parity)

  func testLineMatchesDesktopComposeReply() {
    // Fixture from interaction-reply.test.ts.
    XCTAssertEqual(
      InteractionReply.line(question: "To whom?", answer: "john@example.com"),
      "To whom?: john@example.com")
  }

  func testQuestionReplySendsPickedOptionLabel() {
    // Fixture from interaction-card.test.ts: picking o1 commits the label "John".
    XCTAssertEqual(InteractionReply.questionReply(step: q1, optionID: "o1"), "Who is it for?: John")
    XCTAssertEqual(InteractionReply.questionReply(step: q1, optionID: "o2"), "Who is it for?: Jane")
  }

  func testQuestionReplyIsNilForUnknownOptionOrNonQuestion() {
    XCTAssertNil(InteractionReply.questionReply(step: q1, optionID: "gone"))
    XCTAssertNil(InteractionReply.questionReply(step: connect, optionID: "o1"))
  }

  func testPlanApproveMessageMatchesDesktopStartWorkingMessage() {
    // planReady.startWorkingMessage in app/src/locales/en/chat.json.
    XCTAssertEqual(Strings.Interaction.planApproveMessage, "Go ahead with the plan.")
  }
}
