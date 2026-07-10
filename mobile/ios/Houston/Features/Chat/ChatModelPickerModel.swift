import Foundation
import Observation
import os

/// Streams `providers/<agentId>` for ``ModelPickerSheet``: a slim, read-only
/// sibling of `AIModelsModel` (Features/AIModels) that skips the connect/login
/// vocabulary this sheet never drives — the "+" menu's picker only lists
/// already-CONFIGURED providers' models (PARITY note in the sheet doc comment).
/// Reads go through a `ScopeStore` retained while the sheet is on screen; the
/// refresh write goes through the same `providers/refresh` command
/// `AIModelsModel` uses, so both surfaces agree on the wire shape.
@MainActor
@Observable
final class ChatModelPickerModel {
  let agentId: String

  private let client: SdkClient
  private let store: ScopeStore<ProvidersViewModel>
  private var retention: ScopeRetention?
  private let log = Logger(subsystem: "ai.gethouston.app", category: "chat-model-picker")

  init(agentId: String, client: SdkClient = .shared) {
    self.agentId = agentId
    self.client = client
    self.store = client.scope(SdkScope.providers(agentId: agentId), as: ProvidersViewModel.self)
  }

  /// False until the first `providers/<agentId>` merge resolves.
  var loaded: Bool { store.snapshot?.loaded ?? false }
  /// The raw wire provider list (unfiltered); the sheet narrows to configured
  /// ones via ``ModelPickerLogic/configuredProviders(_:)``.
  var providers: [ProviderVM] { store.snapshot?.providers ?? [] }

  /// Begin streaming while the sheet is on screen; issue an initial refresh so
  /// the list loads deterministically (subscribe-then-refresh, BRIDGE.md §2.1).
  func retain() -> ScopeRetention {
    if retention == nil {
      retention = store.retain()
      Task { await refresh() }
    }
    return ScopeRetention { [weak self] in
      Task { @MainActor in self?.release() }
    }
  }

  private func release() {
    retention?.cancel()
    retention = nil
  }

  /// A background read-refresh, not a user-initiated write: a failure is logged
  /// rather than surfaced (mirrors `AIModelsModel.refresh()`), and the sheet
  /// still shows whatever the last-good snapshot has.
  private func refresh() async {
    do {
      let _: SdkVoid = try await client.command(
        ProvidersCommand.refresh, ProviderRefreshPayload(agentId: agentId))
    } catch {
      log.error(
        "providers/refresh failed: \(String(describing: error), privacy: .public)")
    }
  }
}
