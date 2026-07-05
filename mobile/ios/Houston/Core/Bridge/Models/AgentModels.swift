import Foundation

/// One agent inside the `agents` scope snapshot.
///
/// Mirrors the SDK's `AgentListItem` (`packages/sdk/src/modules/agents/types.ts`)
/// field-for-field. Decodes tolerantly: unknown JSON members are ignored, so a
/// future additive field never breaks this decode (BRIDGE.md §4).
struct AgentListItem: Decodable, Equatable, Identifiable, Sendable {
  let id: String
  let name: String
  let workspaceId: String
  /// Milliseconds since epoch, as the wire carries it.
  let createdAt: Int
}

/// The `agents` scope view-model: the whole snapshot, republished on any change.
/// `loaded` is `false` until the first successful list resolves.
struct AgentsViewModel: Decodable, Equatable, Sendable {
  let loaded: Bool
  let items: [AgentListItem]
}

extension SdkScope {
  /// The reactive scope the agents module owns.
  static let agents = "agents"
}
