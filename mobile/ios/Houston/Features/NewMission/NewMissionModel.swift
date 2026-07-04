import Foundation
import Observation
import os

/// The new-mission create flow (PARITY §6): create the activity, then send the
/// first turn — creation *is* activity + first send. On a send failure the
/// just-created activity is deleted (rollback) so the board never keeps a fake
/// "running" card. The client-side fallback title is applied immediately; the
/// engine refreshes it to an AI title asynchronously (not this surface's job).
@MainActor
@Observable
final class NewMissionModel {
  /// Where the flow is: composing the message, or sending (create + first turn).
  enum Phase: Equatable { case composing, sending }

  private(set) var phase: Phase = .composing
  /// A send failure, surfaced to the composer; nil when there is none.
  private(set) var errorMessage: String?

  let agent: AgentListItem
  private let runner: any MissionCommandRunning
  private let log = Logger(subsystem: "ai.gethouston.app", category: "new-mission")

  init(agent: AgentListItem, runner: any MissionCommandRunning = SdkClient.shared) {
    self.agent = agent
    self.runner = runner
  }

  /// Run the create flow for `text`. Returns the chat route to push on success,
  /// or nil on failure (with `errorMessage` set). Whitespace-only input is
  /// rejected up front (the composer also disables send).
  func send(text: String) async -> ChatRoute? {
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    let title = MissionTitle.fallback(from: text)
    phase = .sending
    errorMessage = nil

    do {
      let created: CreatedActivity = try await runner.command(
        ActivitiesCommand.create,
        CreateActivityPayload(agentId: agent.id, title: title, description: text)
      )
      do {
        let _: SdkVoid = try await runner.command(
          "turns/send",
          TurnSendPayload(agentId: agent.id, conversationId: created.sessionKey, text: text)
        )
      } catch {
        await rollback(activityId: created.id)
        throw error
      }
      return ChatRoute(sessionKey: created.sessionKey, agentId: agent.id, title: title)
    } catch {
      errorMessage = String(describing: error)
      phase = .composing
      return nil
    }
  }

  /// Delete the orphaned activity after a failed first send. A rollback failure
  /// is logged (never silently dropped) but not surfaced over the send error the
  /// user actually needs to see.
  private func rollback(activityId: String) async {
    do {
      let _: SdkVoid = try await runner.command(
        ActivitiesCommand.delete,
        DeleteActivityPayload(agentId: agent.id, id: activityId)
      )
    } catch {
      log.error("rollback delete failed for \(activityId, privacy: .public): \(String(describing: error), privacy: .public)")
    }
  }
}

/// The result of `activities/create`: the new activity id + the chat session to
/// open (mirrors the SDK's `CreatedActivity`).
struct CreatedActivity: Decodable, Equatable, Sendable {
  let id: String
  let sessionKey: String
}

struct CreateActivityPayload: Encodable {
  let agentId: String
  let title: String
  let description: String
}

struct TurnSendPayload: Encodable {
  let agentId: String
  let conversationId: String
  let text: String
}

struct DeleteActivityPayload: Encodable {
  let agentId: String
  let id: String
}
