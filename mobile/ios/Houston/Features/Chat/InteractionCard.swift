import SwiftUI

/// The composer-adjacent card shown when a settled turn is waiting on the user
/// (ask_user / request_connection / plan_ready). A WhatsApp-native adaptation of
/// desktop's composer-replacing stepper (`ui/chat/interaction-card.tsx`): it sits
/// ABOVE the live composer and walks the renderable steps ONE at a time, with a
/// quiet "x of n" caption for a multi-step sequence.
///
/// The mount seam (owned by ``ChatView``) passes the raw interaction plus the
/// three actions this surface can drive: `onAnswer` sends a normal user turn
/// (question pick / plan approval), `onOpenAIModels` routes a sign-in step, and
/// `onOpenIntegrations` routes a connect step. Appearance/removal animate through
/// ``FeedMotion/rowTransition(reduceMotion:)`` — the parent inserts/removes it
/// inside an animation as the interaction becomes non-`nil` / `nil`.
struct InteractionCard: View {
  @Environment(\.theme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let interaction: PendingInteraction
  let isSending: Bool
  let onAnswer: (String) -> Void
  let onOpenAIModels: () -> Void
  let onOpenIntegrations: () -> Void

  @State private var stepper: InteractionStepper

  init(
    interaction: PendingInteraction,
    isSending: Bool,
    onAnswer: @escaping (String) -> Void,
    onOpenAIModels: @escaping () -> Void,
    onOpenIntegrations: @escaping () -> Void
  ) {
    self.interaction = interaction
    self.isSending = isSending
    self.onAnswer = onAnswer
    self.onOpenAIModels = onOpenAIModels
    self.onOpenIntegrations = onOpenIntegrations
    _stepper = State(initialValue: InteractionStepper(interaction))
  }

  var body: some View {
    // The VM clears the interaction on turn start (running → the read seam
    // returns nil), so a NEW interaction always arrives on a fresh card identity
    // and `@State` re-seeds — no stale cursor to reset here.
    if let step = stepper.current {
      card(step)
        .transition(FeedMotion.rowTransition(reduceMotion: reduceMotion))
    }
  }

  private func card(_ step: InteractionStep) -> some View {
    VStack(alignment: .leading, spacing: Spacing.space12) {
      if stepper.showsProgress {
        Text(Strings.Interaction.progress(stepper.progress.current, stepper.progress.total))
          .font(Typography.caption)
          .foregroundStyle(theme.mutedFg)
      }
      stepContent(step)
        .id(stepper.index)
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .trailing)))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Spacing.space16)
    .background(theme.card, in: RoundedRectangle(cornerRadius: Radius.composer, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.composer, style: .continuous)
        .strokeBorder(theme.border, lineWidth: 1))
  }

  @ViewBuilder private func stepContent(_ step: InteractionStep) -> some View {
    switch step {
    case let .question(_, question, options):
      InteractionQuestionView(
        question: question, options: options, isSending: isSending, onPick: pick(option:))
    case let .signin(_, reason):
      InteractionSigninView(
        reason: reason, isSending: isSending, canAdvance: stepper.canAdvance,
        onSignin: onOpenAIModels, onContinue: goNext)
    case let .connect(_, toolkit, reason):
      InteractionConnectView(
        toolkit: toolkit, reason: reason, isSending: isSending, canAdvance: stepper.canAdvance,
        onConnect: onOpenIntegrations, onContinue: goNext)
    case let .planReady(_, summary):
      InteractionPlanReadyView(summary: summary, isSending: isSending, onApprove: approvePlan)
    case .unknown:
      EmptyView()
    }
  }

  /// Pick an option on the current question. On the LAST step this commits the
  /// answer and sends the combined "Q1: a\nQ2: b" body (desktop parity); on an
  /// earlier step it commits and advances to the next question, so a multi-
  /// question ask collects every answer instead of dropping all but the first.
  private func pick(option: InteractionOption) {
    if stepper.isLastStep {
      stepper.commit(answer: option.label)
      onAnswer(stepper.combinedReply)
    } else {
      withAnimation(reduceMotion ? nil : .smooth(duration: Motion.fast)) {
        stepper.commit(answer: option.label)
        stepper.advance()
      }
    }
  }

  private func approvePlan() {
    onAnswer(Strings.Interaction.planApproveMessage)
  }

  private func goNext() {
    withAnimation(reduceMotion ? nil : .smooth(duration: Motion.fast)) {
      stepper.advance()
    }
  }
}
