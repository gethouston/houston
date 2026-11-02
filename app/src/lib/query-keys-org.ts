/**
 * Multiplayer (org) query keys, spread into `queryKeys`. The current user's org
 * and roster are app-scoped (one org per user).
 */
export const orgQueryKeys = {
  org: () => ["org"] as const,
  /** What adding one more person costs. Under the org prefix, so every roster
   *  invalidation re-quotes too. */
  seatQuote: () => ["org", "seat-quote"] as const,
  /** The routines removing a member would stop, read by the remove
   *  confirmation. The bare prefix refreshes every member's at once. */
  memberRoutines: (userId?: string) =>
    userId === undefined
      ? (["member-routines"] as const)
      : (["member-routines", userId] as const),
  /** C8 spaces: the caller's spaces + pending invites (`GET /v1/orgs`).
   *  App-scoped — the switcher/team-picker needs the full list in one call. */
  orgs: () => ["orgs"] as const,
  /** C8 billing: the active org's billing summary (`GET /v1/org/billing`),
   *  keyed by that org, so no org's billing is ever read under another's. */
  billing: (orgSlug: string) => ["billing", orgSlug] as const,
  /** Every org's billing summary, for a change that moves several orgs. */
  billingAll: () => ["billing"] as const,
  /** A free org's routines (`GET /v1/me/routines`), keyed by the org. */
  planRoutines: (orgSlug: string) => ["plan-routines", orgSlug] as const,
  billingChoice: () => ["billing-choice"] as const,
  /** C8 spaces: one agent-move's progress, keyed by agent + moveId so two
   *  moves (or a retry with a fresh id) never share a poll. */
  agentMove: (agentId: string, moveId: string) =>
    ["agent-move", agentId, moveId] as const,
  /** Teams v2: the org audit feed (paged by before-cursor). App-scoped — one
   *  org per user. Owner sees org-wide; admin their managed agents. */
  orgAudit: () => ["org-audit"] as const,
  /** Teams v2: per-agent/user usage counters over a `days` window. Keyed by the
   *  window so 7- vs 30-day reads don't collide. */
  orgUsage: (days: number) => ["org-usage", days] as const,
  /** Per-agent compute usage (engine running time) over a `days` window.
   *  Cloud-only (gated on `capabilities.computeUsage`); keyed by the window. */
  computeUsage: (days: number) => ["compute-usage", days] as const,
  /**
   * Teams v2: an agent's allowed-toolkit settings (agent + org ceilings +
   * caller access). Fetched only on a Teams host; the mutation self-invalidates
   * this.
   */
  agentSettings: (agentId: string) => ["agent-settings", agentId] as const,
  agentDelegation: (agentId: string) => ["agent-delegation", agentId] as const,
  /**
   * Teams v2: the ACTING user's per-agent model choice plus the agent's
   * effective `allowedModels` ceiling (`GET /agents/:slug/model-choice`). Keyed
   * by agent id; served only by a Teams gateway (degrades to `null` elsewhere).
   * The set mutation self-invalidates this key.
   */
  agentModelChoice: (agentId: string) =>
    ["agent-model-choice", agentId] as const,
};
