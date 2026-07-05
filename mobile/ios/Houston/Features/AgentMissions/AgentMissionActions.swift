import Foundation

/// The **Delete** mission action, added to the shared ``MissionActions`` (whose
/// Approve / Archive / Rename this screen reuses). Delete is only surfaced on the
/// per-agent missions screen's card menu (PARITY §1 card actions), so it lives in
/// the AgentMissions feature rather than the cross-agent Mission Control board.
///
/// It runs the `activities/delete` command through the same runner, so the
/// `activities/<agentId>` scope republishes and the list updates reactively — the
/// action returns once the command settles and never mutates local state. The
/// error propagates; the caller surfaces it (no silent failure, per CLAUDE.md).
extension MissionActions {
    /// Permanently delete a mission (and its chat). Irreversible — the caller
    /// confirms first (PARITY: destructive card action).
    func delete(_ card: MissionCardData) async throws {
        let _: SdkVoid = try await runner.command(
            ActivitiesCommand.delete,
            DeleteActivityPayload(agentId: card.agentId, id: card.activityId)
        )
    }
}
