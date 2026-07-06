import SwiftUI
import UIKit

/// The hosted device-code OAuth flow (landmine 2): show the one-time code, open
/// the verification URL, and poll `providers/refreshStatus` (GET /auth/status)
/// every ~3s until the credential lands. The terminal decision comes from the
/// pure `LoginPollReducer`; this view only drives the timer and the UI.
/// Cancelling calls `providers/cancelLogin`.
struct DeviceCodeView: View {
  @Environment(\.theme) private var theme
  @Environment(\.openURL) private var openURL
  let model: AIModelsModel
  let card: ProviderCardModel
  let verificationUri: String
  let userCode: String
  let onDone: () -> Void

  /// The provider being connected (device-code cards wrap one member).
  private var providerId: String { card.primaryMember.id }
  private static let pollInterval: Duration = .seconds(3)

  @State private var copied = false
  @State private var failure: String?
  /// True once the login reached a terminal state (success), so leaving the
  /// sheet does NOT cancel a login that already finished.
  @State private var settled = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Spacing.space16) {
        VStack(alignment: .leading, spacing: Spacing.space8) {
          Text(Strings.AIModels.Login.title(card.name))
            .font(Typography.title)
            .foregroundStyle(theme.foreground)
          Text(Strings.AIModels.Login.deviceDescription)
            .font(Typography.callout)
            .foregroundStyle(theme.mutedFg)
        }

        codeBlock
        Text(Strings.AIModels.Login.deviceCodeHint(card.name))
          .font(Typography.caption)
          .foregroundStyle(theme.mutedFg)

        if let url = URL(string: verificationUri) {
          Button { openURL(url) } label: {
            Label(Strings.AIModels.Login.openUrl, systemImage: "arrow.up.right.square")
              .font(Typography.label)
              .foregroundStyle(theme.primaryFg)
              .frame(maxWidth: .infinity)
              .padding(.vertical, Spacing.space12)
              .background(theme.primary, in: Capsule())
          }
          .buttonStyle(.plain)
        }

        if card.id == "openai" {
          Text(Strings.AIModels.Login.deviceSettingsHint)
            .font(Typography.caption)
            .foregroundStyle(theme.mutedFg)
        }

        if let failure {
          Text(failure).font(Typography.caption).foregroundStyle(theme.destructive)
        } else {
          HStack(spacing: Spacing.space8) {
            ProgressView().controlSize(.small)
            Text(Strings.AIModels.Login.deviceWaiting)
              .font(Typography.caption)
              .foregroundStyle(theme.mutedFg)
          }
        }
      }
      .padding(Spacing.space20)
    }
    .task { await poll() }
    .onAppear { if let url = URL(string: verificationUri) { openURL(url) } }
    .onDisappear {
      // Abandoned before the credential landed → cancel the in-flight login so
      // the pod isn't left waiting on a device grant nobody will complete.
      guard !settled else { return }
      Task { try? await model.cancelLogin(provider: providerId) }
    }
  }

  private var codeBlock: some View {
    HStack(spacing: Spacing.space12) {
      Text(userCode)
        .font(.system(.title2, design: .monospaced))
        .foregroundStyle(theme.foreground)
        .textSelection(.enabled)
      Spacer(minLength: 0)
      Button(action: copyCode) {
        Label(
          copied ? Strings.AIModels.Login.codeCopied : Strings.AIModels.Login.copyCode,
          systemImage: copied ? "checkmark" : "doc.on.doc")
          .font(Typography.label)
          .foregroundStyle(copied ? theme.success : theme.primary)
      }
      .buttonStyle(.plain)
    }
    .padding(Spacing.space16)
    .frame(maxWidth: .infinity)
    .background(theme.secondary, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.lg, style: .continuous)
        .strokeBorder(theme.border, lineWidth: 1))
  }

  private func copyCode() {
    UIPasteboard.general.string = userCode
    copied = true
    Task {
      try? await Task.sleep(for: .seconds(2))
      copied = false
    }
  }

  /// Poll the credential status until it settles. Loops until the task is
  /// cancelled (sheet dismissed) or a terminal decision arrives.
  private func poll() async {
    while !Task.isCancelled {
      try? await Task.sleep(for: Self.pollInterval)
      if Task.isCancelled { return }
      await model.refreshStatus()
      switch LoginPollReducer.decide(model.member(wireId: providerId)) {
      case .keepPolling:
        continue
      case .succeeded:
        settled = true
        onDone()
        return
      case let .failed(reason):
        failure = reason ?? Strings.AIModels.Toast.signInFailed(card.name)
        return
      }
    }
  }
}
