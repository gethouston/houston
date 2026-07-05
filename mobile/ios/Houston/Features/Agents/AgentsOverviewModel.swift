import Foundation
import Observation
import os

/// The concrete cross-agent aggregation seam (``AgentsOverviewProviding``) that
/// BOTH the Agents tab and Mission Control read from — the single fan-out over
/// the `agents` scope and, per agent, its `activities/<id>` scope. Owning it here
/// (the Agents feature) keeps Mission Control from duplicating the subscription
/// fan-out (see `AgentsOverviewSeam`).
///
/// Data flow (self-driving, no view required):
///   - `retain()` opens the `agents` subscription (refcounted) and issues
///     `agents/refresh` so the list loads deterministically.
///   - An observation loop keeps the per-agent `activities/<id>` subscriptions in
///     lockstep with the agent list; each newly appeared agent is subscribed AND
///     `activities/refresh`ed (the activities module only loads an agent once
///     refreshed). Subscribe-then-refresh so the published snapshot is never
///     missed (BRIDGE.md §2.1).
///   - `agents` recomposes from the live snapshots; consumers observe it through
///     Observation and re-render as snapshots arrive.
@MainActor
@Observable
final class AgentsOverviewModel: AgentsOverviewProviding {
    private let client: SdkClient
    private let log = Logger(subsystem: "ai.gethouston.app", category: "agents")

    private let agentsStore: ScopeStore<AgentsViewModel>
    private var agentsRetention: ScopeRetention?
    private var activityStores: [String: ScopeStore<ActivitiesViewModel>] = [:]
    private var activityRetentions: [String: ScopeRetention] = [:]
    private var refCount = 0

    init(client: SdkClient = .shared) {
        self.client = client
        self.agentsStore = client.scope(SdkScope.agents, as: AgentsViewModel.self)
    }

    // MARK: AgentsOverviewProviding

    var loaded: Bool { agentsStore.snapshot?.loaded ?? false }

    var agents: [AgentActivities] {
        (agentsStore.snapshot?.items ?? []).map { agent in
            AgentActivities(
                agent: agent,
                activities: activityStores[agent.id]?.snapshot?.items ?? [])
        }
    }

    func retain() -> ScopeRetention {
        refCount += 1
        if refCount == 1 { open() }
        return ScopeRetention { [weak self] in
            Task { @MainActor in self?.release() }
        }
    }

    // MARK: Lifecycle

    private func open() {
        agentsRetention = agentsStore.retain()
        Task { await refresh(ActivitiesCommand.agentsRefresh, SdkNoPayload()) }
        trackAgentList()
    }

    private func release() {
        guard refCount > 0 else { return }
        refCount -= 1
        guard refCount == 0 else { return }
        agentsRetention?.cancel()
        agentsRetention = nil
        for retention in activityRetentions.values { retention.cancel() }
        activityRetentions.removeAll()
        activityStores.removeAll()
    }

    /// Re-sync per-agent subscriptions now, then re-arm an observation so any
    /// later change to the agent list re-syncs (the non-view equivalent of a
    /// SwiftUI `.onChange`).
    private func trackAgentList() {
        syncSubscriptions()
        withObservationTracking {
            _ = agentsStore.snapshot
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self, self.refCount > 0 else { return }
                self.trackAgentList()
            }
        }
    }

    private func syncSubscriptions() {
        let current = Set((agentsStore.snapshot?.items ?? []).map(\.id))

        for id in current where activityStores[id] == nil {
            let store = client.scope(
                SdkScope.activities(agentId: id), as: ActivitiesViewModel.self)
            activityStores[id] = store
            activityRetentions[id] = store.retain()
            Task { await refresh(ActivitiesCommand.refresh, RefreshActivitiesPayload(agentId: id)) }
        }

        for id in Array(activityStores.keys) where !current.contains(id) {
            activityRetentions[id]?.cancel()
            activityRetentions[id] = nil
            activityStores[id] = nil
        }
    }

    private func refresh<P: Encodable>(_ type: String, _ payload: P) async {
        do {
            let _: SdkVoid = try await client.command(type, payload)
        } catch {
            log.error(
                "\(type, privacy: .public) failed: \(String(describing: error), privacy: .public)")
        }
    }
}
