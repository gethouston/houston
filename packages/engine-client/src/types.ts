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

export type LoginStatus = "starting" | "awaiting_user" | "complete" | "error";

export interface LoginState {
  status: LoginStatus;
  /** Provider authorize URL to open in the browser. */
  url?: string;
  error?: string;
}

export interface AuthStatus {
  /** True once a Claude (Anthropic) subscription credential is stored. */
  anthropicConfigured: boolean;
  /** The in-flight login, if any. */
  login: LoginState | null;
}

export interface StartLoginResponse {
  /** Open this in a browser; on a remote host, paste the resulting code back. */
  url: string;
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
