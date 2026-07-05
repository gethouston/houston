import Foundation

/// The read-side command strings the Agents overview fan-out drives, added to the
/// shared `ActivitiesCommand` namespace (defined in `MissionControl/
/// MissionActions.swift`, which owns the write-side strings). Kept additive here
/// so the two features share ONE command vocabulary instead of duplicating it.
/// `agents/refresh` is an agents-module command; it lives alongside for the
/// overview's single call site.
extension ActivitiesCommand {
    /// `activities/refresh` — refetch + republish an agent's `activities/<id>`.
    static let refresh = "activities/refresh"
    /// `agents/refresh` — refetch + republish the `agents` scope (no payload).
    static let agentsRefresh = "agents/refresh"
}

/// Payload for `activities/refresh` (mirrors the SDK's `parseRefresh`).
struct RefreshActivitiesPayload: Encodable {
    let agentId: String
}
