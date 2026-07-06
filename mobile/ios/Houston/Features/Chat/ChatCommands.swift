import Foundation

/// The narrow command seam the mission chat drives, so the screen model is
/// testable with a spy and never reaches for `SdkClient.shared` directly. The
/// production adapter (``SdkChatCommands``) forwards each call to the one facade
/// every surface talks to (``SdkClient``), speaking the exact command `type`s
/// the SDK's turns/activities modules register (BRIDGE.md §9.4).
@MainActor
protocol ChatCommanding {
  /// Attach to the conversation: hydrates persisted history, then streams live
  /// (`turns/observe` — the gaps agent made it history-first, PARITY §5).
  func observe(agentId: String, conversationId: String) async throws
  /// Start a turn with the user's message (`turns/send`). `model`, when set, is
  /// a per-conversation pin (HOU-695 — the "+" menu's model picker sets it on
  /// ``ChatScreenModel``); it never touches the agent-wide default and the
  /// runtime resolves the owning provider from it. `nil` falls back to the
  /// agent's active provider/model, exactly like an omitted wire field.
  func send(agentId: String, conversationId: String, text: String, model: String?) async throws
  /// Cancel the in-flight turn (`turns/cancel` — the silent needs_you Stop).
  func cancel(agentId: String, conversationId: String) async throws
  /// Transition a mission's status, e.g. approve → `done` (`activities/setStatus`).
  func setStatus(agentId: String, activityId: String, status: String) async throws
  /// Create a mission's activity — the first half of a draft's first send
  /// (`activities/create`). Returns the new activity id + its chat session key.
  func create(agentId: String, title: String, description: String) async throws -> CreatedActivity
  /// Delete an activity — the rollback when a draft's first send fails after the
  /// activity was created (`activities/delete`), so the board keeps no fake card.
  func delete(agentId: String, activityId: String) async throws
}

/// The production ``ChatCommanding``: forwards to ``SdkClient``.
struct SdkChatCommands: ChatCommanding {
  let client: SdkClient

  func observe(agentId: String, conversationId: String) async throws {
    let _: SdkVoid = try await client.command(
      "turns/observe", ConversationRef(conversationId: conversationId, agentId: agentId))
  }

  func send(agentId: String, conversationId: String, text: String, model: String?) async throws {
    let _: SdkVoid = try await client.command(
      "turns/send",
      SendArgs(conversationId: conversationId, text: text, agentId: agentId, model: model))
  }

  func cancel(agentId: String, conversationId: String) async throws {
    let _: SdkVoid = try await client.command(
      "turns/cancel", ConversationRef(conversationId: conversationId, agentId: agentId))
  }

  func setStatus(agentId: String, activityId: String, status: String) async throws {
    let _: SdkVoid = try await client.command(
      "activities/setStatus", SetStatusArgs(agentId: agentId, id: activityId, status: status))
  }

  func create(agentId: String, title: String, description: String) async throws -> CreatedActivity {
    try await client.command(
      "activities/create", CreateArgs(agentId: agentId, title: title, description: description))
  }

  func delete(agentId: String, activityId: String) async throws {
    let _: SdkVoid = try await client.command(
      "activities/delete", DeleteArgs(agentId: agentId, id: activityId))
  }

  // Payload shapes mirror the SDK command validators verbatim
  // (`turns/turn-inputs.ts`, `activities/payloads.ts`): the JSON keys ARE the
  // property names below, so encoding is a straight pass-through.
  private struct ConversationRef: Encodable {
    let conversationId: String
    let agentId: String
  }
  private struct SendArgs: Encodable {
    let conversationId: String
    let text: String
    let agentId: String
    /// Per-turn model pin (`TurnSendInput.model`, `turn-inputs.ts`). Absent
    /// optionals are omitted, matching the TS `undefined`.
    let model: String?
  }
  private struct SetStatusArgs: Encodable {
    let agentId: String
    let id: String
    let status: String
  }
  private struct CreateArgs: Encodable {
    let agentId: String
    let title: String
    let description: String
  }
  private struct DeleteArgs: Encodable {
    let agentId: String
    let id: String
  }
}

/// The result of `activities/create`: the new activity id + the chat session to
/// open (mirrors the SDK's `CreatedActivity`). Consumed by a draft chat's first
/// send to transition the draft into the real conversation.
struct CreatedActivity: Decodable, Equatable, Sendable {
  let id: String
  let sessionKey: String
}
