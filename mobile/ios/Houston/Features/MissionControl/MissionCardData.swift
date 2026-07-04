import Foundation

/// The view-model for one mission card, flattened across agents (PARITY §3).
///
/// Everything the card renders is precomputed here so the view stays dumb: the
/// resolved `MissionState` (glow/border semantics), the decoded description
/// preview, the tags, and the routing address. `agentColorHex` is `nil` on
/// mobile because the base `agents` scope carries no color (a hosted-gateway
/// extra) — the avatar falls back to Houston gray, which is correct.
struct MissionCardData: Identifiable, Equatable, Sendable {
  let activityId: String
  let agentId: String
  let agentName: String
  let agentColorHex: String?
  let title: String
  /// Decoded first-message preview; "" when absent (the card hides the line).
  let descriptionPreview: String
  /// Card tags, e.g. ["Routine"] (PARITY §3 `missionCardTags`).
  let tags: [String]
  let updatedAt: String?
  let state: MissionState
  let sessionKey: String

  var id: String { activityId }

  /// The chat route this card opens on tap.
  var chatRoute: ChatRoute {
    ChatRoute(sessionKey: sessionKey, agentId: agentId, title: title)
  }

  /// Build a card from one activity under its owning agent. State comes from the
  /// persisted activity `status` (the activities scope carries no live turn), so
  /// `MissionState.from(activityStatus:)` is authoritative here (PARITY §1).
  static func make(agent: AgentListItem, activity: ActivityItem) -> MissionCardData {
    MissionCardData(
      activityId: activity.id,
      agentId: agent.id,
      agentName: agent.name,
      agentColorHex: nil,
      title: activity.title,
      descriptionPreview: MissionPreviewText.preview(activity.description),
      tags: tags(for: activity),
      updatedAt: activity.updatedAt,
      state: MissionState.from(activityStatus: activity.status.raw),
      sessionKey: activity.sessionKey
    )
  }

  /// PARITY §3 tags: a routine chat shows the "Routine" tag. The desktop's
  /// agent-mode pill needs the agent-modes catalog, which this surface does not
  /// load in v1, so only the routine tag is emitted here (documented deviation).
  private static func tags(for activity: ActivityItem) -> [String] {
    activity.routineId != nil ? [Strings.Board.tagRoutine] : []
  }
}
