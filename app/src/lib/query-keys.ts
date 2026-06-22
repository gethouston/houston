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

  // App-scoped (less reactive, loaded on init)
  /**
   * Provider connection statuses for the chat model picker. Invalidated on
   * `ProviderLoginComplete` so a fresh sign-in flips the picker live instead
   * of waiting for the next mount (issue #342).
   */
  providerStatuses: () => ["provider-statuses"] as const,
};
