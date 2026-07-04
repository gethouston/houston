import Foundation

@testable import Houston

/// Small builders for the SDK models the Mission Control tests exercise, so each
/// test states only the fields it cares about.
enum MissionFixture {
  static func agent(id: String, name: String, createdAt: Int = 0) -> AgentListItem {
    AgentListItem(id: id, name: name, workspaceId: "ws", createdAt: createdAt)
  }

  static func activity(
    id: String,
    title: String = "Untitled",
    status: String = "running",
    description: String? = nil,
    updatedAt: String? = nil,
    sessionKey: String? = nil,
    routineId: String? = nil
  ) -> ActivityItem {
    ActivityItem(
      id: id,
      title: title,
      description: description,
      status: ActivityStatus(raw: status),
      updatedAt: updatedAt,
      sessionKey: sessionKey ?? "activity-\(id)",
      routineId: routineId,
      agent: nil,
      worktreePath: nil,
      provider: nil,
      model: nil
    )
  }

  static func entry(_ agent: AgentListItem, _ activities: [ActivityItem]) -> AgentActivities {
    AgentActivities(agent: agent, activities: activities)
  }
}
