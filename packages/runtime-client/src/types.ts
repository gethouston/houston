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
  ClaudeOAuthCredential,
  ConversationHistory,
  ConversationSummary,
  CustomEndpoint,
  CustomIntegrationAuth,
  GenerateAgentResponse,
  InteractionOption,
  InteractionStep,
  LoginInfo,
  LoginState,
  LoginStatus,
  McpServerAuth,
  PendingInteraction,
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
  Workspace,
} from "@houston/protocol";
// The Claude-subscription credential VALIDATOR (a value, not just a type) — the
// runtime's host→pod materialization route validates the pushed envelope with it.
// The tool-output preview clip (values) — applied by every backend that emits
// `tool_end.content`, so downstream carriers never re-clip.
export {
  clipToolResult,
  parseClaudeOAuthEnvelope,
  TOOL_RESULT_PREVIEW_MAX,
} from "@houston/protocol";

/** The runtime's own conversation-core surface version (`GET /version`). */
export const PROTOCOL_VERSION = 2;

// ── integrations (Composio, platform mode) — gateway-owned, user-scoped ──────
// These routes live on the cloud gateway (`/v1/integrations/*`), keyed by the
// caller's verified Supabase `sub`, and are shared across the user's agents —
// NOT nested under `/agents/:id`. Per-agent access is gated by grants below.

/** One integration provider's readiness. `ready:false` + `reason:"signin"` ⇒
 *  the UI prompts a Houston sign-in (the gateway needs a valid session). */
export interface IntegrationProviderStatus {
  provider: string;
  ready: boolean;
  reason?: "signin";
  /** Legacy per-user Composio connections were found — the user reconnects once. */
  reconnect?: boolean;
}

/** A connectable app in the Composio catalog. `logoUrl` is a REMOTE image. */
export interface IntegrationToolkit {
  slug: string;
  name: string;
  description?: string;
  logoUrl?: string;
  categories?: string[];
}

/** One of the acting user's connected accounts for a toolkit. */
export interface IntegrationConnection {
  toolkit: string;
  connectionId: string;
  status: "active" | "pending" | "error";
}

/** The `{value}` envelope the preferences routes return (null ⇒ unset). */
export interface PreferenceValue {
  value: string | null;
}

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
