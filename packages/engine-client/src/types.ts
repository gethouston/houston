/**
 * Wire contract between the Houston engine and any client (the webapp).
 * This package is the single source of truth for these shapes.
 */

export const PROTOCOL_VERSION = 1;

export interface EngineClientConfig {
  /** Base URL of the engine, e.g. "http://127.0.0.1:4317". */
  baseUrl: string;
  /** Optional bearer token (required when the engine sets HOUSTON_ENGINE_TOKEN). */
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

/** Subscription providers. "anthropic" = Claude Pro/Max, "openai-codex" = ChatGPT/Codex. */
export type ProviderId = "anthropic" | "openai-codex";

export type LoginStatus = "starting" | "awaiting_user" | "complete" | "error";

/**
 * How the user completes a login. Anthropic returns a `url` to open; Codex
 * returns a device code to enter at `verificationUri`.
 */
export type LoginInfo =
  | { kind: "url"; url: string }
  | { kind: "device_code"; verificationUri: string; userCode: string };

export interface LoginState {
  status: LoginStatus;
  info?: LoginInfo;
  error?: string;
}

export interface ProviderAuth {
  provider: ProviderId;
  name: string;
  configured: boolean;
  login: LoginState | null;
}

export interface AuthStatus {
  providers: ProviderAuth[];
  /** Provider used for new chats (saved active, else first connected). */
  activeProvider: ProviderId | null;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  configured: boolean;
  isActive: boolean;
  activeModel: string;
  models: string[];
}

export interface Settings {
  activeProvider?: ProviderId;
  models?: Partial<Record<ProviderId, string>>;
}

export type ChatRole = "user" | "assistant";

export interface ToolCallRecord {
  name: string;
  isError?: boolean;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** epoch ms */
  ts: number;
  tools?: ToolCallRecord[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessage?: string;
}

export interface ConversationHistory {
  id: string;
  title: string;
  messages: ChatMessage[];
}

/**
 * Streaming turn events (SSE). Each SSE frame is `data: <WireEvent JSON>`.
 * These wrap pi's native agent events in a stable, minimal shape.
 */
export type WireEvent =
  | { type: "text"; data: string }
  | { type: "thinking"; data: string }
  | { type: "tool_start"; data: { name: string; args: unknown } }
  | { type: "tool_end"; data: { name: string; isError: boolean } }
  | { type: "done"; data: null }
  | { type: "error"; data: { message: string } };

export type WireEventType = WireEvent["type"];
