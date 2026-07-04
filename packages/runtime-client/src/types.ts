/**
 * Wire types for the runtime's conversation core. The SHAPES live in
 * @houston/protocol (the v3 contract; the host re-serves this core under
 * /v1/agents/:id/conversations/*) — this package re-exports them so existing
 * consumers keep importing from @houston/runtime-client.
 */

export type {
  AuthFailureCause,
  AuthStatus,
  ChatMessage,
  ChatRole,
  ConversationHistory,
  ConversationSummary,
  CustomEndpoint,
  LoginInfo,
  LoginState,
  LoginStatus,
  ProviderAuth,
  ProviderError,
  ProviderId,
  ProviderInfo,
  Settings,
  TokenUsage,
  ToolCallRecord,
  WireEvent,
  WireEventType,
  WireFrame,
} from "@houston/protocol";

/** The runtime's own conversation-core surface version (`GET /version`). */
export const PROTOCOL_VERSION = 2;

export interface EngineClientConfig {
  /** Base URL of the engine, e.g. "http://127.0.0.1:4317". */
  baseUrl: string;
  /** Optional bearer token (required when the engine sets HOUSTON_RUNTIME_TOKEN). */
  token?: string;
  /** Override fetch (tests / SSR). Defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface HealthResponse {
  status: "ok";
  version: string;
}

export interface VersionResponse {
  engine: string;
  protocol: number;
}

/**
 * A routine suggested by instruction generation. `schedule` is a 5-field cron
 * BUILT AND VALIDATED by the runtime from a constrained schedule set — never
 * the LLM's raw expression.
 */
export interface SuggestedRoutine {
  name: string;
  prompt: string;
  schedule: string;
}

/** `POST /generate-instructions` — AI-assisted agent creation. */
export interface GenerateInstructionsResponse {
  name: string;
  instructions: string;
  /** Composio toolkit slugs (e.g. "GMAIL"); display names are the client's job. */
  suggestedIntegrations: string[];
  suggestedRoutine: SuggestedRoutine | null;
}
