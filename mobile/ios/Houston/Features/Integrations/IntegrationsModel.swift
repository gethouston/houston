import Foundation
import Observation
import os

/// The load outcome of the per-agent grant map. Kept SEPARATE from the per-agent
/// unsupported tri-state (which lives inside `IntegrationGrants`): a thrown read
/// (a transient 500 / network error / timeout on one agent) is `failed`, never
/// silently folded into "unsupported → every agent allowed" (no-silent-failures;
/// PARITY-SETTINGS §3, landmine 5).
enum GrantsLoad: Equatable {
  /// The first read for the current (ready + agent-set) has not resolved yet.
  case loading
  /// Every agent's grant read resolved (each still tri-state inside the map).
  case loaded(IntegrationGrants)
  /// At least one agent's read threw — surfaced inline + retriable.
  case failed(String)
}

/// The reactive read/write model behind the Integrations surface — the single
/// place that subscribes to the user-scoped `integrations` scope (readiness +
/// catalog + connections) and the `agents` scope, loads each agent's per-agent
/// grant set, and issues the connect / disconnect / grant commands.
///
/// Integrations are gateway-owned and user-scoped (NOT per-agent), so the VM
/// scope is the flat `integrations` string; only the grant reads/writes are
/// keyed by agent slug (PARITY-SETTINGS §0). Grants are loaded for every known
/// agent and re-synced whenever the ready-state or the agent set changes, so the
/// per-app detail sheet's toggles reflect the live grant map (`IntegrationGrants`
/// carries the 404-null vs empty-array tri-state).
@MainActor
@Observable
final class IntegrationsModel {
  private let client: SdkClient
  private let log = Logger(subsystem: "ai.gethouston.app", category: "integrations")

  private let integrationsStore: ScopeStore<IntegrationsViewModel>
  private let agentsStore: ScopeStore<AgentsViewModel>
  private var integrationsRetention: ScopeRetention?
  private var agentsRetention: ScopeRetention?
  private var refCount = 0

  /// The load outcome of the per-agent grant map (see ``GrantsLoad``). This is
  /// the single source of truth; ``grants`` / ``grantsLoaded`` / ``grantsError``
  /// derive from it. A thrown read is `failed`, NEVER folded into "unsupported".
  private(set) var grantsLoad: GrantsLoad = .loading
  /// The (ready-state + agent-id set) fingerprint the current grants belong to,
  /// so a redundant reload is skipped on unrelated snapshot churn.
  private var grantsKey = ""

  /// The loaded grant map, or an empty map while loading / after a failure.
  var grants: IntegrationGrants {
    if case let .loaded(grants) = grantsLoad { return grants }
    return IntegrationGrants()
  }
  /// `true` once the grant map has loaded for the current ready + agent set, so a
  /// per-agent surface can tell "still loading" apart from "unsupported".
  var grantsLoaded: Bool {
    if case .loaded = grantsLoad { return true }
    return false
  }
  /// The reason the last grant read failed, or `nil`. Non-nil means the surface
  /// must show a retriable inline error, NOT the "all agents allowed" fallback.
  var grantsError: String? {
    if case let .failed(message) = grantsLoad { return message }
    return nil
  }

  init(client: SdkClient = .shared) {
    self.client = client
    self.integrationsStore = client.scope(SdkScope.integrations, as: IntegrationsViewModel.self)
    self.agentsStore = client.scope(SdkScope.agents, as: AgentsViewModel.self)
  }

  // MARK: Derived reads

  var snapshot: IntegrationsViewModel? { integrationsStore.snapshot }
  var state: IntegrationsScreenState { .derive(from: snapshot) }
  var toolkits: [IntegrationToolkit] { snapshot?.toolkits ?? [] }
  var connections: [IntegrationConnection] { snapshot?.connections ?? [] }
  var agents: [AgentListItem] { agentsStore.snapshot?.items ?? [] }

  private var bySlug: [String: IntegrationToolkit] {
    Dictionary(toolkits.map { ($0.slug, $0) }, uniquingKeysWith: { first, _ in first })
  }

  /// Resolve a toolkit slug (from a connection or catalog entry) to display info.
  func display(for slug: String) -> AppDisplay {
    AppDisplay.resolve(slug: slug, toolkit: bySlug[slug])
  }

  /// The slugs the user already has a connection for (any status) — the catalog
  /// excludes these so no app is offered twice.
  var connectedSlugs: Set<String> { Set(connections.map(\.toolkit)) }

  // MARK: Lifecycle

  func retain() -> ScopeRetention {
    refCount += 1
    if refCount == 1 { open() }
    return ScopeRetention { [weak self] in
      Task { @MainActor in self?.release() }
    }
  }

  private func open() {
    integrationsRetention = integrationsStore.retain()
    agentsRetention = agentsStore.retain()
    Task { await runVoid(IntegrationsCommand.refresh, SdkNoPayload()) }
    Task { await runVoid(ActivitiesCommand.agentsRefresh, SdkNoPayload()) }
    trackGrants()
  }

  private func release() {
    guard refCount > 0 else { return }
    refCount -= 1
    guard refCount == 0 else { return }
    integrationsRetention?.cancel(); integrationsRetention = nil
    agentsRetention?.cancel(); agentsRetention = nil
    grantsLoad = .loading
    grantsKey = ""
  }

  /// Keep the grant map in lockstep with the ready-state + agent set (the
  /// non-view equivalent of `.onChange`): re-sync now, then re-arm on any
  /// snapshot change (mirrors `AgentsOverviewModel.trackAgentList`).
  private func trackGrants() {
    syncGrants()
    withObservationTracking {
      _ = integrationsStore.snapshot
      _ = agentsStore.snapshot
    } onChange: { [weak self] in
      Task { @MainActor in
        guard let self, self.refCount > 0 else { return }
        self.trackGrants()
      }
    }
  }

  private func syncGrants() {
    let ready = state == .ready
    let ids = agents.map(\.id).sorted()
    let key = ready ? ids.joined(separator: ",") : "!"
    guard key != grantsKey else { return }
    grantsKey = key
    guard ready else {
      grantsLoad = .loading
      return
    }
    Task { await loadGrants(ids: ids) }
  }

  private func loadGrants(ids: [String]) async {
    var byAgent: [String: [String]?] = [:]
    do {
      for id in ids { byAgent[id] = try await fetchGrants(id) }
    } catch {
      // Drop a stale failure if the agent set moved on while we were fetching.
      guard Set(ids) == Set(agents.map(\.id)) else { return }
      log.error("grants load failed: \(String(describing: error), privacy: .public)")
      grantsLoad = .failed(Self.message(for: error))
      return
    }
    // Drop a stale load if the agent set changed while we were fetching.
    guard Set(ids) == Set(agents.map(\.id)) else { return }
    grantsLoad = .loaded(IntegrationGrants(byAgent: byAgent))
  }

  /// Retry the grant load after a failure (the inline "Try again" affordance).
  func reloadGrants() async {
    guard state == .ready else { return }
    grantsLoad = .loading
    await loadGrants(ids: agents.map(\.id).sorted())
  }

  // MARK: Grant commands

  /// Read one agent's grants. Returns the granted slugs, or `nil` when the host
  /// answered JSON-`null`/absent (grants UNSUPPORTED for that agent) — distinct
  /// from `[]` (nothing granted). THROWS a ``CommandError`` on a real failure (a
  /// transient 500 / network error / timeout) so the caller surfaces it as a
  /// retriable load error instead of misreading it as unsupported (no-silent-
  /// failures; PARITY-SETTINGS §3, landmine 5).
  private func fetchGrants(_ agentId: String) async throws -> [String]? {
    let value: JSONValue = try await client.command(
      IntegrationsCommand.grants, IntegrationGrantsPayload(agentId: agentId))
    if case let .array(items) = value { return items.compactMap(\.stringValue) }
    return nil
  }

  /// The user-facing reason for a failed grant read — the server message when the
  /// SDK reported one, else the error's description.
  private static func message(for error: Error) -> String {
    (error as? CommandError)?.message ?? error.localizedDescription
  }

  /// Toggle whether `agentId` may use `toolkit`, submitting the replace-set. A
  /// no-op when grants are unsupported for the agent. Updates the local map
  /// optimistically so the toggle reflects immediately.
  func setGrant(toolkit: String, agentId: String, active: Bool) async {
    guard case let .loaded(current) = grantsLoad,
      let next = current.toggled(toolkit: toolkit, for: agentId, active: active)
    else { return }
    var updated = current
    updated.set(next, for: agentId)
    grantsLoad = .loaded(updated)
    do {
      let _: SdkVoid = try await client.command(
        IntegrationsCommand.setGrants, SetGrantsPayload(agentId: agentId, toolkits: next))
    } catch {
      log.error("setGrants failed: \(String(describing: error), privacy: .public)")
      await loadGrants(ids: agents.map(\.id))  // reconcile from the server
    }
  }

  /// Disconnect a toolkit for the whole account, then refetch the VM.
  func disconnect(toolkit: String) async {
    await runVoid(IntegrationsCommand.disconnect, IntegrationToolkitPayload(toolkit: toolkit))
    await refresh()
  }

  /// Refetch readiness + catalog + connections (the connect flow calls this when
  /// a connection lands so a newly-connected app flips to "Connected").
  func refresh() async {
    await runVoid(IntegrationsCommand.refresh, SdkNoPayload())
  }

  private func runVoid<P: Encodable>(_ type: String, _ payload: P) async {
    do {
      let _: SdkVoid = try await client.command(type, payload)
    } catch {
      log.error("\(type, privacy: .public) failed: \(String(describing: error), privacy: .public)")
    }
  }
}
