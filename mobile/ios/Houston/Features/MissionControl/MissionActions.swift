import Foundation

/// The write side of a mission card's explicit actions (PARITY §1/§2): Archive
/// and Rename. Each is one `activities/*` command through the shared runner; the
/// scope republishes and the board updates reactively, so these return once the
/// command settles and never mutate local state directly.
///
/// `setStatus` stays general (any status) — the move-to-done affordance was
/// removed from the lists, but the status mutation is still used by Archive and
/// remains available for the mission-moving flow the founder will design later.
///
/// Errors are propagated, never swallowed — the caller surfaces them.
@MainActor
struct MissionActions {
  let runner: any MissionCommandRunning

  init(runner: any MissionCommandRunning = SdkClient.shared) {
    self.runner = runner
  }

  /// Archive a mission (status → `archived`, PARITY §2). Reversible by replying.
  func archive(_ card: MissionCardData) async throws {
    try await setStatus(agentId: card.agentId, id: card.activityId, status: "archived")
  }

  /// Rename a mission's title. Empty/whitespace titles are rejected before the
  /// command so the board never shows a blank card title.
  func rename(_ card: MissionCardData, to title: String) async throws {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { throw MissionActionError.emptyTitle }
    let _: SdkVoid = try await runner.command(
      ActivitiesCommand.rename,
      RenamePayload(agentId: card.agentId, id: card.activityId, title: trimmed)
    )
  }

  private func setStatus(agentId: String, id: String, status: String) async throws {
    let _: SdkVoid = try await runner.command(
      ActivitiesCommand.setStatus,
      SetStatusPayload(agentId: agentId, id: id, status: status)
    )
  }
}

/// Failures a mission action can raise before touching the bridge.
enum MissionActionError: Error, Equatable {
  case emptyTitle
}

/// The `activities/*` command type strings (mirrors the SDK's `ActivitiesCommand`).
enum ActivitiesCommand {
  static let create = "activities/create"
  static let setStatus = "activities/setStatus"
  static let rename = "activities/rename"
  static let delete = "activities/delete"
}

struct SetStatusPayload: Encodable {
  let agentId: String
  let id: String
  let status: String
}

struct RenamePayload: Encodable {
  let agentId: String
  let id: String
  let title: String
}

/// Payload for `activities/delete` (mirrors the SDK's `parseDelete`). Used by the
/// per-agent Delete action; the draft-chat rollback path deletes through the
/// Chat command seam instead.
struct DeleteActivityPayload: Encodable {
  let agentId: String
  let id: String
}
