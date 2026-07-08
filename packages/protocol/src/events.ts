/**
 * The global host event channel (`GET /v1/events`, WS or SSE): domain-change
 * notifications that drive UI reactivity (TanStack Query invalidation).
 * Carries the SAME vocabulary the Rust engine's firehose used, so the
 * frontend's event→query-key invalidation map survives the convergence.
 *
 * How an event is DETECTED differs per profile (local: FS watcher; cloud:
 * post-turn sync diff) — the vocabulary on the wire does not.
 *
 * Per-turn streaming (text/thinking/tool frames) is NOT here — that rides the
 * per-conversation SSE stream (conversation.ts WireEvent).
 */

/** `agentPath` is the agent's opaque key (the v1 folderPath; cloud synthesizes a stable key). */
export type HoustonEvent =
  | { type: "ActivityChanged"; agentPath: string }
  | { type: "RoutinesChanged"; agentPath: string }
  | { type: "RoutineRunsChanged"; agentPath: string }
  | { type: "ConfigChanged"; agentPath: string }
  | { type: "LearningsChanged"; agentPath: string }
  | { type: "SkillsChanged"; agentPath: string }
  | { type: "ContextChanged"; agentPath: string }
  | { type: "FilesChanged"; agentPath: string }
  | { type: "ConversationsChanged"; agentPath: string }
  | { type: "WorkspacesChanged" }
  | { type: "AgentsChanged"; workspaceId: string }
  | { type: "SidebarLayoutChanged"; workspaceId: string }
  | { type: "Toast"; level: "info" | "error"; message: string }
  | { type: "CompletionToast"; agentPath: string; title: string; body: string }
  | { type: "AuthRequired"; provider: string };

export type HoustonEventType = HoustonEvent["type"];
