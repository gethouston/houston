import Foundation

/// Every agent's grant set, held as a tri-state per the 404-null landmine
/// (PARITY-SETTINGS §3, landmine 5). A value is:
///  - `nil` — the host answered 404 for that agent: grants are UNSUPPORTED.
///  - `[]` — the agent grants NOTHING (distinct from unsupported).
///  - `[slugs]` — the agent grants exactly those toolkits.
///
/// Grants are ``supported`` unless ANY agent resolved to `nil` (the host has no
/// grant routes at all, so per-agent toggles would be broken); the surface then
/// renders "every agent can use this" instead of toggles.
struct IntegrationGrants: Equatable {
  /// agentId -> granted toolkit slugs, or `nil` when unsupported for that agent.
  private(set) var byAgent: [String: [String]?]

  init(byAgent: [String: [String]?] = [:]) {
    self.byAgent = byAgent
  }

  /// `false` once any agent reported grants unsupported (404 → `nil`).
  var supported: Bool {
    !byAgent.values.contains { $0 == nil }
  }

  /// This agent's granted slugs, or `nil` when unsupported / not yet loaded.
  func grants(for agentId: String) -> [String]? {
    byAgent[agentId] ?? nil
  }

  /// The set of agent ids that currently grant `toolkit` (empty when
  /// unsupported — no agent has a per-agent grant then).
  func agentIds(forToolkit toolkit: String) -> Set<String> {
    var ids = Set<String>()
    for (agentId, grants) in byAgent {
      if let grants, grants.contains(toolkit) { ids.insert(agentId) }
    }
    return ids
  }

  /// Replace one agent's grant set in place (optimistic UI after `setGrants`).
  mutating func set(_ toolkits: [String], for agentId: String) {
    byAgent[agentId] = toolkits
  }

  /// The grant set for `agentId` with `toolkit` toggled on/off — the replace-set
  /// a `setGrants` write submits. Returns `nil` when the agent is unsupported
  /// (there is nothing to toggle). Idempotent: adding an existing slug or
  /// removing an absent one yields the same set.
  func toggled(toolkit: String, for agentId: String, active: Bool) -> [String]? {
    guard let current = grants(for: agentId) else { return nil }
    var set = current.filter { $0 != toolkit }
    if active { set.append(toolkit) }
    return set
  }
}
