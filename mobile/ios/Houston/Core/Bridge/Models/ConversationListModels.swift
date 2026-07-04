import Foundation

/// One row in an agent's conversation list. Mirrors the SDK's
/// `ConversationListItem` (`packages/sdk/src/modules/conversations/types.ts`).
struct ConversationListItem: Decodable, Equatable, Identifiable, Sendable {
  let id: String
  let title: String
  /// Milliseconds since epoch.
  let createdAt: Int
  /// Milliseconds since epoch.
  let updatedAt: Int
  /// Preview of the most recent message, when the engine supplies one.
  var lastMessage: String?
}

/// The `conversations/<agentId>` scope view-model. `loaded` is `false` while
/// loading or never fetched, `true` once a fetch resolves.
struct ConversationListVM: Decodable, Equatable, Sendable {
  let loaded: Bool
  let items: [ConversationListItem]
}
