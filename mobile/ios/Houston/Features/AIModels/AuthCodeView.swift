import SwiftUI

/// The auth-code OAuth flow (`LoginInfo.kind == "auth_code"`): open the sign-in
/// URL, approve, then paste the verification code back to `providers/completeLogin`
/// (providers.json:providerLogin). `instructions`, when present, are the runtime's
/// step-by-step guidance (e.g. the Claude setup-token steps) and `url` is a
/// reference rather than a sign-in page.
struct AuthCodeView: View {
  @Environment(\.theme) private var theme
  @Environment(\.openURL) private var openURL
  let model: AIModelsModel
  let card: ProviderCardModel
  let url: String
  let instructions: String?
  let onDone: () -> Void

  @State private var code = ""
  @State private var submitting = false
  @State private var error: String?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.space16) {
        VStack(alignment: .leading, spacing: Spacing.space8) {
          Text(Strings.AIModels.Login.title(card.name))
            .font(Typography.title)
            .foregroundStyle(theme.ink)
          Text(instructions ?? Strings.AIModels.Login.authCodeDescription(card.name))
            .font(Typography.callout)
            .foregroundStyle(theme.inkMuted)
        }

        if let link = URL(string: url) {
          Button { openURL(link) } label: {
            Label(Strings.AIModels.Login.openUrl, systemImage: "arrow.up.right.square")
              .font(Typography.label)
              .foregroundStyle(theme.actionText)
              .frame(maxWidth: .infinity)
              .padding(.vertical, Spacing.space12)
              .background(theme.action, in: Capsule())
          }
          .buttonStyle(.plain)
        }

        VStack(alignment: .leading, spacing: Spacing.space6) {
          Text(Strings.AIModels.Login.codeLabel)
            .font(Typography.caption)
            .foregroundStyle(theme.inkMuted)
          TextField(Strings.AIModels.Login.codePlaceholder, text: $code)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(Spacing.space12)
            .background(theme.lineInput, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        }

        if let error {
          Text(error).font(Typography.caption).foregroundStyle(theme.danger)
        }

        Button(action: submit) {
          HStack(spacing: Spacing.space8) {
            if submitting { ProgressView().controlSize(.mini) }
            Text(Strings.AIModels.Login.submit)
          }
          .font(Typography.label)
          .foregroundStyle(theme.ink)
          .frame(maxWidth: .infinity)
          .padding(.vertical, Spacing.space12)
          .background(theme.chip, in: Capsule())
          .overlay(Capsule().strokeBorder(theme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(submitting)
      }
      .padding(Spacing.space20)
    }
  }

  private func submit() {
    let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      error = Strings.AIModels.Login.codeRequired
      return
    }
    submitting = true
    error = nil
    Task {
      do {
        try await model.completeLogin(provider: card.primaryMember.id, code: trimmed)
        onDone()
      } catch {
        submitting = false
        self.error = Strings.AIModels.Toast.signInFailed(card.name)
      }
    }
  }
}
