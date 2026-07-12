import SwiftUI

/// The paste-a-key connect form for an `apiKey` provider (providers.json:apiKey).
/// A SecureField for the key, a "Get your API key" link to the provider's
/// dashboard, and a Connect action that writes the key and closes on success.
struct ApiKeyView: View {
  @Environment(\.theme) private var theme
  @Environment(\.openURL) private var openURL
  let model: AIModelsModel
  let card: ProviderCardModel
  let onDone: () -> Void

  @State private var key = ""
  @State private var submitting = false
  @State private var error: String?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.space16) {
        VStack(alignment: .leading, spacing: Spacing.space8) {
          Text(Strings.AIModels.ApiKey.title(card.name))
            .font(Typography.title)
            .foregroundStyle(theme.ink)
          Text(Strings.AIModels.ApiKey.description(card.name))
            .font(Typography.callout)
            .foregroundStyle(theme.inkMuted)
        }

        if let urlString = card.apiKeyUrl, let url = URL(string: urlString) {
          Button { openURL(url) } label: {
            Label(Strings.AIModels.ApiKey.getKey, systemImage: "arrow.up.right.square")
              .font(Typography.label)
              .foregroundStyle(theme.action)
          }
          .buttonStyle(.plain)
        }

        VStack(alignment: .leading, spacing: Spacing.space6) {
          Text(Strings.AIModels.ApiKey.label)
            .font(Typography.caption)
            .foregroundStyle(theme.inkMuted)
          SecureField(Strings.AIModels.ApiKey.placeholder, text: $key)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .padding(Spacing.space12)
            .background(theme.lineInput, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
        }

        if let error {
          Text(error)
            .font(Typography.caption)
            .foregroundStyle(theme.danger)
        }

        Button(action: connect) {
          HStack(spacing: Spacing.space8) {
            if submitting { ProgressView().controlSize(.mini) }
            Text(Strings.AIModels.ApiKey.save)
          }
          .font(Typography.label)
          .foregroundStyle(theme.actionText)
          .frame(maxWidth: .infinity)
          .padding(.vertical, Spacing.space12)
          .background(theme.action, in: Capsule())
        }
        .buttonStyle(.plain)
        .disabled(submitting)
      }
      .padding(Spacing.space20)
    }
  }

  private func connect() {
    let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      error = Strings.AIModels.ApiKey.required
      return
    }
    submitting = true
    error = nil
    Task {
      do {
        try await model.setApiKey(provider: card.primaryMember.id, key: trimmed)
        onDone()
      } catch {
        submitting = false
        self.error = Strings.AIModels.Toast.signInFailed(card.name)
      }
    }
  }
}
