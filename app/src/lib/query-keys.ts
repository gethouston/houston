/**
 * Centralized query key factory for TanStack Query.
 *
 * Every agent-scoped query is keyed by [resource, agentPath].
 * This makes invalidation trivial: on an "ActivityChanged" event for path X,
 * invalidate queryKeys.activity(X).
 */
export const queryKeys = {
  // Agent-scoped (reactive via file watcher + Tauri events)
  activity: (agentPath: string) => ["activity", agentPath] as const,
  skills: (agentPath: string) => ["skills", agentPath] as const,
  skillDetail: (agentPath: string, name: string) =>
    ["skill-detail", agentPath, name] as const,
  files: (agentPath: string) => ["files", agentPath] as const,
  instructions: (agentPath: string) => ["instructions", agentPath] as const,
  workspaceContext: (agentPath: string) =>
    ["workspace-context", agentPath] as const,
  config: (agentPath: string) => ["config", agentPath] as const,
  routines: (agentPath: string) => ["routines", agentPath] as const,
  learnings: (agentPath: string) => ["learnings", agentPath] as const,
  routineRuns: (agentPath: string, routineId?: string) =>
    routineId
      ? (["routine-runs", agentPath, routineId] as const)
      : (["routine-runs", agentPath] as const),
  conversations: (agentPath: string) => ["conversations", agentPath] as const,
  allConversations: (agentPaths: string[]) =>
    ["all-conversations", ...agentPaths] as const,
  chatHistory: (agentPath: string, sessionKey: string) =>
    ["chat-history", agentPath, sessionKey] as const,
  /**
   * Prefix key covering EVERY session's chat history for an agent. Used for
   * coarse invalidation on `ConversationsChanged` (the event carries no
   * session key): a teammate's message must appear live in an open
   * conversation, not on the next remount/focus. Correctness over precision.
   */
  chatHistoryForAgent: (agentPath: string) =>
    ["chat-history", agentPath] as const,

  // App-scoped (less reactive, loaded on init)
  /**
   * Provider connection statuses for the chat model picker. Invalidated on
   * `ProviderLoginComplete` so a fresh sign-in flips the picker live instead
   * of waiting for the next mount (issue #342).
   */
  providerStatuses: (providers?: readonly string[] | null) =>
    providers
      ? (["provider-statuses", ...providers] as const)
      : (["provider-statuses"] as const),
  capabilities: () => ["capabilities"] as const,

  /**
   * Live per-account provider usage (the AI Hub's Usage tab): rate-limit
   * windows + prepaid balances from each provider's own usage API. App-scoped
   * (credentials are workspace-central); refreshed on an interval while the
   * tab is mounted, and invalidated alongside provider statuses on a connect
   * so a fresh account shows without a manual refresh.
   */
  providerUsage: () => ["provider-usage"] as const,

  /**
   * C9 personal API keys (`GET /v1/keys`). App-scoped (one set per user, not
   * agent-scoped) and hosted-gateway only — the create/revoke mutations
   * self-invalidate this key. The full secret from a mint is NEVER cached here;
   * it lives only in the create dialog's local state for its one-time reveal.
   */
  apiKeys: () => ["api-keys"] as const,

  /**
   * Per-workspace sidebar arrangement (sort mode + named groups + drag order).
   * Optimistically updated by the layout mutation; also invalidated on the
   * `SidebarLayoutChanged` event for best-effort cross-surface/tab sync.
   */
  sidebarLayout: (workspaceId: string) =>
    ["sidebar-layout", workspaceId] as const,

  /**
   * The one-time post-migration "reconnect your AI" gate. `migrationReconnect`
   * holds the host's `chatHistoryMigrated` flag (does this install come from the
   * legacy desktop build); `migrationReconnectDismissed` holds the persisted
   * "already seen" flag. Both rarely change, so they are app-scoped.
   */
  migrationReconnect: () => ["migration-reconnect"] as const,
  migrationReconnectDismissed: () => ["migration-reconnect-dismissed"] as const,

  /** First-run cloud-migration wizard (HOU-719): the `detect_legacy_houston`
   *  scan for old desktop data on this machine. Stable for the app's life. */
  cloudMigrationDetect: () => ["cloud-migration-detect"] as const,

  // Integrations are user-level (shared across the user's agents), so they are
  // NOT keyed by agentPath even though they surface in a per-agent tab.
  integrationStatus: () => ["integration-status"] as const,
  integrationConnections: (provider: string) =>
    ["integration-connections", provider] as const,
  integrationToolkits: (provider: string) =>
    ["integration-toolkits", provider] as const,
  /** HOU-550: the user's custom (API / MCP) integrations. User-level, one list. */
  customIntegrations: () => ["custom-integrations"] as const,
  /** The per-agent read of the same list (HOU-823) — shares the
   *  "custom-integrations" prefix so one invalidation refreshes both. */
  agentCustomIntegrations: (agentId: string) =>
    ["custom-integrations", agentId] as const,

  // Multiplayer (org). The current user's org + roster is app-scoped (one org
  // per user).
  org: () => ["org"] as const,
  /** C8 spaces: the caller's spaces + pending invites (`GET /v1/orgs`).
   *  App-scoped — the switcher/team-picker needs the full list in one call. */
  orgs: () => ["orgs"] as const,
  /** C8 billing: the active team's billing summary (`GET /v1/org/billing`).
   *  App-scoped — reads the active space; dropped whole on a space switch by
   *  `resetCacheForSpaceChange`, so it never carries the prior team's billing. */
  billing: () => ["billing"] as const,
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
   * The actions an agent runs without asking again (the always-allow set from
   * the action-approval gate). Keyed by agent id; the chat card's always-allow
   * write and the review section's revoke both invalidate it so the "Runs
   * without asking" list stays live. Degrades to `[]` on a host without the gate.
   */
  actionApprovals: (agentId: string) => ["action-approvals", agentId] as const,
  /**
   * Teams v2: an agent's allowed-toolkit settings (agent + org ceilings +
   * caller access). Fetched only on a Teams host; the mutation self-invalidates
   * this.
   */
  agentSettings: (agentId: string) => ["agent-settings", agentId] as const,
  /**
   * Teams v2: the ACTING user's per-agent model choice plus the agent's
   * effective `allowedModels` ceiling (`GET /agents/:slug/model-choice`). Keyed
   * by agent id; served only by a Teams gateway (degrades to `null` elsewhere).
   * The set mutation self-invalidates this key.
   */
  agentModelChoice: (agentId: string) =>
    ["agent-model-choice", agentId] as const,
};
