import Foundation

/// Typed builders for the SDK scope strings a surface subscribes to.
///
/// Scopes are opaque strings on the wire (`"agents"`, `"conversation/<id>"`,
/// `"activities/<agentId>"`); centralizing their construction here keeps callers
/// from hand-formatting one and risking a typo. The values mirror the scope
/// helpers in `packages/sdk/src` verbatim.
enum SdkScope {
  /// One agent's conversation LIST — `conversations/<agentId>`
  /// (`conversationListScope`).
  static func conversations(agentId: String) -> String {
    "conversations/\(agentId)"
  }

  /// One conversation's live feed VM — `conversation/<sessionKey>`
  /// (`conversationScope`).
  static func conversation(sessionKey: String) -> String {
    "conversation/\(sessionKey)"
  }

  /// One agent's board/missions list — `activities/<agentId>`
  /// (`activitiesScope`).
  static func activities(agentId: String) -> String {
    "activities/\(agentId)"
  }
}
