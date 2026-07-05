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
  GenerateAgentResponse,
  LoginInfo,
  LoginState,
  LoginStatus,
  ProviderAuth,
  ProviderError,
  ProviderId,
  ProviderInfo,
  Settings,
  SuggestedRoutine,
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
