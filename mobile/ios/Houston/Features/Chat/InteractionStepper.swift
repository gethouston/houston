import Foundation

/// The interaction card's step cursor — a pure, DOM-free walk over the renderable
/// steps so it unit-tests without a view (mirrors desktop's
/// `interaction-card-logic.ts`). The card binds it as `@State`.
///
/// Mobile adaptation of the desktop stepper (spec §3): a signin/connect step
/// advances via its "continue" affordance. A `question` step COMMITS its answer
/// and, when a later step follows, advances to it — so a multi-question ask
/// collects every answer and sends ONE combined "Q1: a\nQ2: b" body on the last
/// step (desktop parity, `toCompletedAnswers` + `composeInteractionReply`).
/// Answering the LAST step SENDS a turn, and the VM clears the pending
/// interaction on turn start, so the whole card disappears through that same
/// reactivity (no local answered-state to track). Questions are ordered first.
struct InteractionStepper: Equatable {
  /// Renderable steps only (``PendingInteraction/renderableSteps``).
  let steps: [InteractionStep]
  /// The step the card currently shows.
  private(set) var index: Int
  /// Question answers committed so far (in step order), composed into the single
  /// combined reply the last step sends.
  private(set) var answers: [InteractionReply.Answer]

  init(_ interaction: PendingInteraction) {
    steps = interaction.renderableSteps
    index = 0
    answers = []
  }

  /// The step to render now, or `nil` when the cursor ran off the end (an
  /// all-unknown interaction yields no steps, so the card renders nothing).
  var current: InteractionStep? {
    steps.indices.contains(index) ? steps[index] : nil
  }

  var count: Int { steps.count }

  /// Show the "x of n" caption only for a genuine multi-step sequence.
  var showsProgress: Bool { steps.count > 1 }

  /// 1-based `(current, total)` for the progress caption.
  var progress: (current: Int, total: Int) { (index + 1, steps.count) }

  /// A later renderable step exists to advance to — drives whether a signin /
  /// connect step offers its "continue" affordance (there is somewhere to go).
  var canAdvance: Bool { index < steps.count - 1 }

  /// The cursor is on the final renderable step, so answering it must SEND the
  /// combined reply rather than advance.
  var isLastStep: Bool { !canAdvance }

  /// Advance past a completed signin/connect step to the next renderable step.
  /// A no-op on the last step (nothing to advance to).
  mutating func advance() {
    if canAdvance { index += 1 }
  }

  /// Commit the current question step's answer (in step order) for the combined
  /// reply. Ignored off a question step (signin/connect contribute no answer).
  mutating func commit(answer: String) {
    guard case let .question(_, question, _) = current else { return }
    answers.append(InteractionReply.Answer(question: question, answer: answer))
  }

  /// The single combined body all committed answers send on the last step —
  /// `"Q1: a\nQ2: b"`, exactly desktop's `composeInteractionReply` for a
  /// question-only sequence.
  var combinedReply: String { InteractionReply.combined(answers) }
}

/// The exact strings the card sends, ported verbatim from desktop so the two
/// surfaces stay in lockstep (`interaction-reply.ts` `composeInteractionReply`,
/// `plan-ready` `startWorkingMessage`). Pure so composition is fixture-tested.
enum InteractionReply {
  /// One committed question answer (`ChatInteractionAnswer`): the question text
  /// and the user's answer, composed into the combined reply in step order.
  struct Answer: Equatable, Sendable {
    let question: String
    let answer: String
  }

  /// The `"<question>: <answer>"` line desktop composes per answered question
  /// (`composeInteractionReply`). A single-question ask sends exactly this body,
  /// with no auto-continue wrapper (that wrapper is desktop's connect/signin-only
  /// path, which mobile routes through navigation instead of a hidden send).
  static func line(question: String, answer: String) -> String {
    "\(question): \(answer)"
  }

  /// The combined body a multi-question ask sends when its last step completes:
  /// one `"<question>: <answer>"` line per answer, newline-joined — desktop's
  /// `composeInteractionReply` for a question-only sequence (`lines.join("\n")`).
  static func combined(_ answers: [Answer]) -> String {
    answers.map { line(question: $0.question, answer: $0.answer) }.joined(separator: "\n")
  }

  /// The message a picked question option sends: the `"<question>: <label>"`
  /// line for the option whose id matches. Returns `nil` when the step is not a
  /// question or the option id is unknown (a defensive no-send).
  static func questionReply(step: InteractionStep, optionID: String) -> String? {
    guard case let .question(_, question, options) = step,
      let label = options.first(where: { $0.id == optionID })?.label
    else { return nil }
    return line(question: question, answer: label)
  }
}
