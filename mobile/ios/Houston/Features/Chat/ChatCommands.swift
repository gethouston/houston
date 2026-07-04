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
  /// Start a turn with the user's message (`turns/send`).
  func send(agentId: String, conversationId: String, text: String) async throws
  /// Cancel the in-flight turn (`turns/cancel` — the silent needs_you Stop).
  func cancel(agentId: String, conversationId: String) async throws
  /// Transition a mission's status, e.g. approve → `done` (`activities/setStatus`).
  func setStatus(agentId: String, activityId: String, status: String) async throws
}

/// The production ``ChatCommanding``: forwards to ``SdkClient``.
struct SdkChatCommands: ChatCommanding {
  let client: SdkClient

  func observe(agentId: String, conversationId: String) async throws {
    let _: SdkVoid = try await client.command(
      "turns/observe", ConversationRef(conversationId: conversationId, agentId: agentId))
  }

  func send(agentId: String, conversationId: String, text: String) async throws {
    let _: SdkVoid = try await client.command(
      "turns/send", SendArgs(conversationId: conversationId, text: text, agentId: agentId))
  }

  func cancel(agentId: String, conversationId: String) async throws {
    let _: SdkVoid = try await client.command(
      "turns/cancel", ConversationRef(conversationId: conversationId, agentId: agentId))
  }

  func setStatus(agentId: String, activityId: String, status: String) async throws {
    let _: SdkVoid = try await client.command(
      "activities/setStatus", SetStatusArgs(agentId: agentId, id: activityId, status: status))
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
  }
  private struct SetStatusArgs: Encodable {
    let agentId: String
    let id: String
    let status: String
  }
}
