import Foundation

/// Decodes an array element WITHOUT letting one bad element fail the whole
/// array: it always decodes successfully, capturing the inner value or `nil`
/// when the element is malformed. `[LossyDecodable<T>]` then yields the surviving
/// `T`s via `compactMap(\.value)`, the idiomatic Swift lossy-array decode (a bare
/// `try container.decode(T.self)` in an unkeyed loop does not reliably advance
/// past a throwing element). Used for forward-compatible interaction decoding.
struct LossyDecodable<T: Decodable>: Decodable {
  let value: T?

  init(from decoder: Decoder) throws {
    value = try? T(from: decoder)
  }
}

/// One selectable option on a question step (`InteractionOption`,
/// `packages/protocol/src/domain/interaction.ts`). `label` is BOTH what the user
/// sees and the text a pick contributes to the answer (see ``InteractionReply``).
struct InteractionOption: Decodable, Equatable, Identifiable, Sendable {
  let id: String
  let label: String
}

/// One step in a pending interaction — the Swift mirror of the protocol
/// `InteractionStep` union (`interaction.ts`), as an enum with associated values.
///
/// An UNRECOGNISED `kind` decodes to ``unknown`` and renders nothing, so a newer
/// engine step type can never crash the whole conversation decode or blank the
/// card (forward-compat, mirrors the desktop `isInteractionStep` guard). Known
/// kinds decode their required fields; a `question`'s `options` are optional
/// (absent → no rows, a free-text-only ask).
enum InteractionStep: Decodable, Equatable, Sendable {
  case question(id: String, question: String, options: [InteractionOption])
  case signin(id: String, reason: String?)
  case connect(id: String, toolkit: String, reason: String?)
  case planReady(id: String, summary: String)
  case unknown(kind: String)

  private enum CodingKeys: String, CodingKey {
    case kind, id, question, options, reason, toolkit, summary
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let kind = try c.decode(String.self, forKey: .kind)
    switch kind {
    case "question":
      // Options decode LOSSILY: a single malformed option (e.g. missing `label`)
      // is dropped, keeping the question and its surviving options rather than
      // failing the whole step. Mirrors desktop, whose question guard never
      // validates `options`.
      let options = try c.decodeIfPresent([LossyDecodable<InteractionOption>].self, forKey: .options)
      self = .question(
        id: try c.decode(String.self, forKey: .id),
        question: try c.decode(String.self, forKey: .question),
        options: options?.compactMap(\.value) ?? [])
    case "signin":
      self = .signin(
        id: try c.decode(String.self, forKey: .id),
        reason: try c.decodeIfPresent(String.self, forKey: .reason))
    case "connect":
      self = .connect(
        id: try c.decode(String.self, forKey: .id),
        toolkit: try c.decode(String.self, forKey: .toolkit),
        reason: try c.decodeIfPresent(String.self, forKey: .reason))
    case "plan_ready":
      self = .planReady(
        id: try c.decode(String.self, forKey: .id),
        summary: try c.decode(String.self, forKey: .summary))
    default:
      self = .unknown(kind: kind)
    }
  }

  /// Whether this step renders a UI. A forward-compat ``unknown`` kind renders
  /// nothing, so the stepper skips it and never shows a blank card.
  var isRenderable: Bool {
    if case .unknown = self { return false }
    return true
  }

  /// Whether this step BLOCKS the mission on the user — something it is
  /// genuinely waiting for, as opposed to an optional offer it merely carries.
  ///
  /// This is the signal the chat title bar keys its "needs your attention" line
  /// off, NOT the board status: since the engine stopped closing missions on
  /// the user's behalf, every clean finish settles `needs_you`, so a board
  /// status alone would put a permanent attention line on every finished
  /// conversation.
  ///
  /// Listed positively (never `!isRenderable`) so a future case has to declare
  /// which side it is on. The protocol's non-blocking kinds — `suggest_actions`
  /// and `suggest_reusable`, the optional clean-finish offers — have no iOS UI
  /// yet and therefore decode to ``unknown``, as does any kind newer than this
  /// build; both correctly report `false`, which degrades to "no attention
  /// line" exactly as the card degrades to rendering nothing.
  var isBlocking: Bool {
    switch self {
    case .question, .signin, .connect, .planReady: return true
    case .unknown: return false
    }
  }
}

/// The ordered steps a mission is waiting on the user for (`PendingInteraction`).
/// Carried on ``ConversationVM/pendingInteraction``; the ``InteractionCard`` walks
/// the renderable steps one at a time.
struct PendingInteraction: Decodable, Equatable, Sendable {
  let steps: [InteractionStep]

  init(steps: [InteractionStep]) { self.steps = steps }

  /// Decode `steps` LOSSILY: a structurally-malformed KNOWN-kind step (e.g. a
  /// `connect` missing `toolkit`) is dropped instead of throwing and taking the
  /// ENTIRE conversation snapshot down with it. This preserves the same
  /// graceful-degradation the ``InteractionStep/unknown`` path already gives a
  /// FUTURE kind, and mirrors desktop, which renders the rest of the conversation
  /// and treats a bad interaction as absent rather than blanking the feed.
  private enum CodingKeys: String, CodingKey { case steps }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    let lossy = try c.decode([LossyDecodable<InteractionStep>].self, forKey: .steps)
    steps = lossy.compactMap(\.value)
  }

  /// The steps that render (forward-compat ``InteractionStep/unknown`` kinds
  /// dropped) — the sequence the card actually walks.
  var renderableSteps: [InteractionStep] { steps.filter(\.isRenderable) }

  /// Whether anything renders. The read seam treats an all-unknown / empty
  /// interaction as absent so no empty card mounts, mirroring desktop's
  /// `isPendingInteraction`.
  var hasRenderableSteps: Bool { !renderableSteps.isEmpty }

  /// Whether the mission is genuinely waiting on the user (see
  /// ``InteractionStep/isBlocking``). An interaction carrying nothing but the
  /// optional clean-finish offers — or nothing this build understands — is a
  /// FINISHED mission, not a blocked one.
  var hasBlockingSteps: Bool { steps.contains(where: \.isBlocking) }
}
