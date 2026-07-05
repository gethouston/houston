import Foundation

/// Pure, cross-agent aggregation for Mission Control — no SwiftUI, so it unit
/// tests directly. Flattens `[AgentActivities]` into board columns, the archived
/// list, agent filter chips, and the initial landing page (PARITY §1/§2).
enum MissionAggregation {
  /// Every card for `column`, across the agents in `agents`, most-recent first.
  /// Archived and off-board (unknown) statuses never appear on the active board.
  static func missions(
    in column: BoardColumn,
    agents: [AgentActivities],
    agentFilter: String?
  ) -> [MissionCardData] {
    cards(agents: agents, agentFilter: agentFilter) { $0.state.column == column }
  }

  /// The archived cross-agent list (PARITY §2): only `archived` activities.
  static func archived(
    agents: [AgentActivities],
    agentFilter: String?
  ) -> [MissionCardData] {
    cards(agents: agents, agentFilter: agentFilter) { $0.state == .archived }
  }

  /// True when the active board (all three columns) holds no cards for the
  /// current filter — drives the whole-board empty state versus per-column gaps.
  static func activeBoardIsEmpty(agents: [AgentActivities], agentFilter: String?) -> Bool {
    BoardColumn.ordered.allSatisfy {
      missions(in: $0, agents: agents, agentFilter: agentFilter).isEmpty
    }
  }

  /// Agent filter chips: every agent, ordered by most recent activity (recents
  /// first), then by name. "All agents" is prepended by the view.
  static func filterAgents(_ agents: [AgentActivities]) -> [AgentListItem] {
    agents
      .sorted { lhs, rhs in
        switch (lhs.lastActivityAt, rhs.lastActivityAt) {
        case let (l?, r?) where l != r: return l > r
        case (.some, .none): return true
        case (.none, .some): return false
        default: return lhs.agent.name.localizedCaseInsensitiveCompare(rhs.agent.name) == .orderedAscending
        }
      }
      .map(\.agent)
  }

  /// The page to land on: **Needs you** when it holds any card, else **Running**
  /// (PARITY §1 column order). Keeps a user's attention items in front by default.
  static func initialColumn(agents: [AgentActivities], agentFilter: String?) -> BoardColumn {
    missions(in: .needsYou, agents: agents, agentFilter: agentFilter).isEmpty ? .running : .needsYou
  }

  // MARK: - Shared projection

  private static func cards(
    agents: [AgentActivities],
    agentFilter: String?,
    where predicate: (MissionCardData) -> Bool
  ) -> [MissionCardData] {
    let scoped = agentFilter.map { id in agents.filter { $0.agent.id == id } } ?? agents
    let all = scoped.flatMap { entry in
      entry.activities.map { MissionCardData.make(agent: entry.agent, activity: $0) }
    }
    return all
      .filter(predicate)
      .sorted { ($0.updatedAt ?? "") > ($1.updatedAt ?? "") }
  }
}
