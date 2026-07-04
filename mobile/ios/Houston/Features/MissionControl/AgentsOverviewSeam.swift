import Observation
import SwiftUI

/// The cross-agent aggregation seam Mission Control reads from.
///
/// PINNED SEAM: the **Agents** feature owns the concrete `AgentsOverviewModel`
/// that subscribes to `agents` and, per agent, its `activities/<id>` scope,
/// then republishes the combined snapshot. Mission Control must NOT duplicate
/// that fan-out — it consumes it through this protocol so both surfaces share
/// one aggregation.
///
/// The Agents feature's `AgentsOverviewModel` conforms to
/// `AgentsOverviewProviding`; the live instance is injected once at the app root
/// in `HoustonApp` (`.environment(\.agentsOverview, overview)`). The default
/// `EmptyAgentsOverview` below is only the EnvironmentKey fallback (loading/empty
/// states) for previews or a missing injection.
@MainActor
protocol AgentsOverviewProviding: AnyObject, Observable {
  /// False until the agents list has resolved at least once (drives the initial
  /// loading state versus a genuinely empty account).
  var loaded: Bool { get }
  /// Every agent paired with its latest activities snapshot, in list order.
  var agents: [AgentActivities] { get }
  /// Begin streaming the aggregation while a surface is on screen; the returned
  /// token stops it on release (refcounted, mirroring `ScopeStore.retain`).
  func retain() -> ScopeRetention
}

/// One agent together with its board activities (missions). The unit Mission
/// Control flattens across every agent to build its columns and archived list.
struct AgentActivities: Identifiable, Equatable, Sendable {
  let agent: AgentListItem
  let activities: [ActivityItem]
  var id: String { agent.id }

  /// The agent's most recent activity change (ISO), for "recents first" sorting.
  var lastActivityAt: String? {
    activities.compactMap(\.updatedAt).max()
  }
}

/// The no-op default: an account with nothing loaded yet. Replaced at the app
/// root by the Agents feature's live `AgentsOverviewModel` (see FLAG above).
@Observable
final class EmptyAgentsOverview: AgentsOverviewProviding {
  /// `nonisolated` so the `EnvironmentKey` default (a nonisolated static) can
  /// construct it even though the protocol is `@MainActor`.
  nonisolated init() {}
  var loaded: Bool { false }
  var agents: [AgentActivities] { [] }
  func retain() -> ScopeRetention { ScopeRetention {} }
}

private struct AgentsOverviewKey: EnvironmentKey {
  static let defaultValue: any AgentsOverviewProviding = EmptyAgentsOverview()
}

extension EnvironmentValues {
  /// The shared cross-agent overview. Read it with
  /// `@Environment(\.agentsOverview) private var overview`.
  var agentsOverview: any AgentsOverviewProviding {
    get { self[AgentsOverviewKey.self] }
    set { self[AgentsOverviewKey.self] = newValue }
  }
}
