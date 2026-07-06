import Foundation
import Observation
import os

/// The per-agent AI Models view-model: it streams the `providers/<agentId>`
/// scope, exposes the merged connect cards (`AIModelsCatalogMerge`), and runs
/// the credential-mutation commands. All state and behavior for one agent's
/// provider surface lives here; the views bind to it (client-architecture.md
/// invariant 1 — no behavior in surface code beyond binding).
///
/// Provider credentials are per-agent-pod (landmine 1), so this is constructed
/// per agent id. Reads go through a `ScopeStore` retained while a surface is on
/// screen; writes go through the narrow `MissionCommandRunning` seam so they can
/// be stubbed in tests. After every write the SDK ops refetch and republish, so
/// the merged cards update reactively with no manual reload here.
@MainActor
@Observable
final class AIModelsModel {
  let agentId: String

  private let client: SdkClient
  private let runner: any MissionCommandRunning
  private let store: ScopeStore<ProvidersViewModel>
  private var retention: ScopeRetention?
  private let log = Logger(subsystem: "ai.gethouston.app", category: "ai-models")

  init(
    agentId: String,
    client: SdkClient = .shared,
    runner: (any MissionCommandRunning)? = nil
  ) {
    self.agentId = agentId
    self.client = client
    self.runner = runner ?? client
    self.store = client.scope(SdkScope.providers(agentId: agentId), as: ProvidersViewModel.self)
  }

  // MARK: Reads

  /// False until the first `providers/<agentId>` merge resolves.
  var loaded: Bool { store.snapshot?.loaded ?? false }

  /// The merged connect cards in wire order, or empty before the first snapshot.
  var cards: [ProviderCardModel] {
    AIModelsCatalogMerge.merge(store.snapshot?.providers ?? [])
  }

  /// The live wire VM for a provider id (post-refresh poll reads this).
  func member(wireId: String) -> ProviderVM? {
    store.snapshot?.providers.first { $0.id == wireId }
  }

  // MARK: Lifecycle

  /// Begin streaming while the surface is on screen; issue an initial refresh so
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

  func refresh() async {
    await run(ProvidersCommand.refresh, ProviderRefreshPayload(agentId: agentId))
  }

  /// Cheap status-only refetch the device-code poll drives (GET /auth/status).
  func refreshStatus() async {
    await run(ProvidersCommand.refreshStatus, ProviderRefreshPayload(agentId: agentId))
  }

  // MARK: Connect flows

  /// Start an OAuth login. Hosted defaults `deviceAuth` true (no loopback,
  /// landmine 2); the returned `LoginInfo` kind decides which sheet the caller
  /// shows (device_code vs auth_code). Throws on failure so the caller surfaces
  /// the sign-in-failed toast.
  func startLogin(provider: ProviderId, enterpriseDomain: String? = nil) async throws -> LoginInfo {
    try await runner.command(
      ProvidersCommand.login,
      ProviderLoginPayload(
        agentId: agentId, provider: provider, deviceAuth: true, enterpriseDomain: enterpriseDomain))
  }

  func cancelLogin(provider: ProviderId) async throws {
    let _: SdkVoid = try await runner.command(
      ProvidersCommand.cancelLogin, ProviderActionPayload(agentId: agentId, provider: provider))
  }

  func completeLogin(provider: ProviderId, code: String) async throws {
    let _: SdkVoid = try await runner.command(
      ProvidersCommand.completeLogin,
      CompleteLoginPayload(agentId: agentId, provider: provider, code: code))
  }

  func setApiKey(provider: ProviderId, key: String) async throws {
    let _: SdkVoid = try await runner.command(
      ProvidersCommand.setApiKey, SetApiKeyPayload(agentId: agentId, provider: provider, key: key))
  }

  func logout(provider: ProviderId) async throws {
    let _: SdkVoid = try await runner.command(
      ProvidersCommand.logout, ProviderActionPayload(agentId: agentId, provider: provider))
  }

  /// Select a model (and its owning provider + effort). The runtime pairs the
  /// model with its provider, so passing `provider` also switches the active
  /// provider (resolveModelSettings semantics).
  func setModel(provider: ProviderId, model: String, effort: EffortLevel?) async throws {
    let _: SdkVoid = try await runner.command(
      ProvidersCommand.setModel,
      SetModelPayload(agentId: agentId, model: model, effort: effort?.rawValue, provider: provider))
  }

  // MARK: Helpers

  private func run<P: Encodable>(_ type: String, _ payload: P) async {
    do {
      let _: SdkVoid = try await runner.command(type, payload)
    } catch {
      log.error("\(type, privacy: .public) failed: \(String(describing: error), privacy: .public)")
    }
  }
}
