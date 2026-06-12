/**
 * Engine event topic registry.
 *
 * The engine emits every `HoustonEvent` on a topic (see
 * `engine/houston-engine-protocol/src/lib.rs::event_topic`). WebSocket
 * clients subscribe to one or more topics; the firehose (`*`) matches
 * every scoped event (`engine/houston-engine-server/src/ws.rs::is_subscribed`).
 *
 * Topic → event-kind map:
 * - `*` — firehose; matches every topic below.
 * - `session:{session_key}` — FeedItem, SessionStatus
 * - `auth` — AuthRequired
 * - `toast` — Toast, CompletionToast
 * - `events` — EventReceived, EventProcessed
 * - `scheduler` — HeartbeatFired, CronFired
 * - `routines:{agent_path}` — RoutinesChanged, RoutineRunsChanged
 * - `agent:{agent_path}` — ActivityChanged, SkillsChanged, FilesChanged,
 *    ConfigChanged, ContextChanged, LearningsChanged, ConversationsChanged
 * - `composio` — ComposioCliReady, ComposioCliFailed, ComposioConnectionAdded
 * - `claude` — ClaudeCliInstalling, ClaudeCliReady, ClaudeCliFailed
 * - `providers` — ProviderLoginUrl, ProviderLoginComplete
 *
 * (The legacy `sync` topic was removed — mobile now uses the same WS
 * directly through the reverse tunnel.)
 */

/** Convenience topic helpers. */
export const topics = {
  /** Firehose — matches every scoped event. Use for desktop-style clients. */
  firehose: "*",
  session: (sessionKey: string) => `session:${sessionKey}`,
  agent: (agentPath: string) => `agent:${agentPath}`,
  routines: (agentPath: string) => `routines:${agentPath}`,
  auth: "auth",
  toast: "toast",
  events: "events",
  scheduler: "scheduler",
  composio: "composio",
  claude: "claude",
  providers: "providers",
} as const;
