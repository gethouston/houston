import SwiftUI

/// The `signin` step body: why the agent needs the user signed in, plus a button
/// that routes to AI Models (where the same Houston Google SSO lives). Ports
/// desktop's `ChatSigninInteractionCard`. When a later step follows (a mixed
/// signin+connect sequence) a "Next" advance appears so the user can walk on once
/// signed in — mobile's manual stand-in for desktop's gate auto-advance.
struct InteractionSigninView: View {
  @Environment(\.theme) private var theme

  let reason: String?
  let isSending: Bool
  let canAdvance: Bool
  let onSignin: () -> Void
  let onContinue: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space8) {
      Text(reason ?? Strings.Interaction.signinReason)
        .font(Typography.body)
        .foregroundStyle(theme.foreground)
        .fixedSize(horizontal: false, vertical: true)
      Text(Strings.Interaction.signinDescription)
        .font(Typography.callout)
        .foregroundStyle(theme.mutedFg)
        .fixedSize(horizontal: false, vertical: true)
      InteractionPrimaryButton(
        title: Strings.Interaction.signin, isSending: isSending, action: onSignin)
      if canAdvance {
        InteractionContinueButton(isSending: isSending, action: onContinue)
      }
    }
  }
}

/// The `connect` step body: the toolkit the agent asked the user to connect (plus
/// an optional reason), and a button that routes to Integrations. Ports desktop's
/// `ChatConnectInteractionCard`. Offers the same "Next" advance as the sign-in
/// step when a later step follows.
struct InteractionConnectView: View {
  @Environment(\.theme) private var theme

  let toolkit: String
  let reason: String?
  let isSending: Bool
  let canAdvance: Bool
  let onConnect: () -> Void
  let onContinue: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space8) {
      Text(toolkit)
        .font(Typography.bodyMedium)
        .foregroundStyle(theme.foreground)
      if let reason {
        Text(reason)
          .font(Typography.callout)
          .foregroundStyle(theme.mutedFg)
          .fixedSize(horizontal: false, vertical: true)
      }
      InteractionPrimaryButton(
        title: Strings.Interaction.connect, isSending: isSending, action: onConnect)
      if canAdvance {
        InteractionContinueButton(isSending: isSending, action: onContinue)
      }
    }
  }
}

/// The `plan_ready` step body: the drafted plan (rendered as markdown, reusing
/// ``MarkdownText``) and a single approve row. Ports the PRIMARY action of
/// desktop's `ChatPlanReadyCard` (#786/#790) — "Continue in Coworker mode",
/// which sends `startWorkingMessage` as a normal turn.
struct InteractionPlanReadyView: View {
  @Environment(\.theme) private var theme

  let summary: String
  let isSending: Bool
  let onApprove: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: Spacing.space10) {
      Text(Strings.Interaction.planTitle)
        .font(Typography.captionStrong)
        .foregroundStyle(theme.mutedFg)
      MarkdownText(text: summary)
      Button(action: onApprove) {
        VStack(alignment: .leading, spacing: Spacing.space2) {
          Text(Strings.Interaction.planApproveTitle)
            .font(Typography.label)
            .foregroundStyle(theme.foreground)
          Text(Strings.Interaction.planApproveDescription)
            .font(Typography.caption)
            .foregroundStyle(theme.mutedFg)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Spacing.space12)
        .padding(.vertical, Spacing.space10)
        .background(theme.secondary, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
      }
      .buttonStyle(.plain)
      .disabled(isSending)
      .opacity(isSending ? 0.5 : 1)
    }
  }
}

/// The filled primary action shared by the sign-in and connect steps: routes the
/// user to the screen that resolves the step. Inert + dimmed while a send is in
/// flight (parity with the option rows).
struct InteractionPrimaryButton: View {
  @Environment(\.theme) private var theme

  let title: String
  let isSending: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(Typography.label)
        .foregroundStyle(theme.primaryFg)
        .frame(maxWidth: .infinity)
        .padding(.vertical, Spacing.space10)
        .background(theme.primary, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(isSending)
    .opacity(isSending ? 0.5 : 1)
    .padding(.top, Spacing.space4)
  }
}

/// The quiet "Next" advance for a multi-step signin/connect sequence — the manual
/// stand-in for desktop's gate auto-advance once the user resolved the step.
struct InteractionContinueButton: View {
  @Environment(\.theme) private var theme

  let isSending: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(Strings.Interaction.continueStep)
        .font(Typography.label)
        .foregroundStyle(theme.primary)
    }
    .buttonStyle(.plain)
    .disabled(isSending)
    .opacity(isSending ? 0.5 : 1)
  }
}
