import SwiftUI

/// The connect-flow container for one provider card. It picks the right flow on
/// appear and hosts it inside a single sheet so the whole connect journey (incl.
/// the Copilot Personal/Enterprise step → OAuth) never juggles multiple sheets:
///
///  - apiKey provider → paste-a-key form.
///  - GitHub Copilot → Personal/Enterprise prompt, then OAuth with the domain.
///  - other oauth → start the login and, from the returned `LoginInfo` kind,
///    show the device-code or auth-code flow (hosted is device-code by default,
///    landmine 2). `LoginInfo.url` (loopback) is local-only and never reached
///    here; if it somehow arrives we surface a failure rather than hang.
struct ProviderConnectSheet: View {
  @Environment(\.theme) private var theme
  @Environment(\.dismiss) private var dismiss
  let model: AIModelsModel
  let card: ProviderCardModel

  @State private var stage: Stage = .deciding

  /// The wire provider id the connect commands act on (the card's primary member;
  /// for the merged OpenCode account the adapter fans the key across gateways).
  private var providerId: String { card.primaryMember.id }

  enum Stage: Equatable {
    case deciding
    case apiKey
    case copilot
    case starting
    case device(verificationUri: String, userCode: String)
    case authCode(url: String, instructions: String?)
    case failed(String)
  }

  var body: some View {
    NavigationStack {
      stageBody
        .background(theme.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(Strings.AIModels.Login.cancel) { dismiss() }
          }
        }
    }
    .task { decide() }
  }

  @ViewBuilder private var stageBody: some View {
    switch stage {
    case .deciding, .starting:
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    case .apiKey:
      ApiKeyView(model: model, card: card, onDone: { dismiss() })
    case .copilot:
      CopilotConnectView(onCancel: { dismiss() }, onContinue: { domain in
        stage = .starting
        Task { await beginOAuth(enterpriseDomain: domain) }
      })
    case let .device(uri, code):
      DeviceCodeView(
        model: model, card: card, verificationUri: uri, userCode: code,
        onDone: { dismiss() })
    case let .authCode(url, instructions):
      AuthCodeView(
        model: model, card: card, url: url, instructions: instructions,
        onDone: { dismiss() })
    case let .failed(message):
      EmptyStateView(
        title: message, systemImage: "exclamationmark.triangle",
        ctaTitle: Strings.AIModels.Login.cancel, ctaAction: { dismiss() })
    }
  }

  private func decide() {
    guard stage == .deciding else { return }
    if card.copilotConnect {
      stage = .copilot
    } else if card.auth == .apiKey {
      stage = .apiKey
    } else {
      stage = .starting
      Task { await beginOAuth(enterpriseDomain: nil) }
    }
  }

  private func beginOAuth(enterpriseDomain: String?) async {
    do {
      let info = try await model.startLogin(
        provider: providerId, enterpriseDomain: enterpriseDomain)
      switch info {
      case let .deviceCode(uri, code):
        stage = .device(verificationUri: uri, userCode: code)
      case let .authCode(url, instructions):
        stage = .authCode(url: url, instructions: instructions)
      case .url, .unrecognized:
        // Loopback (`url`) is local-only and never hosted; an unrecognized kind
        // this host can't drive is a genuine failure, not a silent hang.
        stage = .failed(Strings.AIModels.Toast.signInFailed(card.name))
      }
    } catch {
      stage = .failed(Strings.AIModels.Toast.signInFailed(card.name))
    }
  }
}
