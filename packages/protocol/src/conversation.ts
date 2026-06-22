/**
 * The conversation core — runtime v2, verbatim. One runtime instance serves
 * exactly this surface; the host nests it under /v1/agents/:id/conversations/*.
 * Source of truth for these shapes; @houston/runtime-client re-exports them.
 */

/**
 * Connectable AI providers.
 * - "anthropic" = Claude Pro/Max, "openai-codex" = ChatGPT/Codex: OAuth (subscription).
 * - "openrouter" = OpenRouter, "google" = Google Gemini: API-key (the user pastes a
 *   key; no OAuth). See `ProviderAuth.authKind`.
 */
export type ProviderId = "anthropic" | "openai-codex" | "openrouter" | "google";

export type LoginStatus = "starting" | "awaiting_user" | "complete" | "error";

/**
 * How the user completes a login:
 * - `url` — open it; the engine catches the redirect on its own loopback
 *   (local engine only — the browser and engine share a machine). Nothing to paste.
 * - `auth_code` — open `url`, approve, then copy the code Claude shows and submit it
 *   via `completeLogin`. The headless path (no shared loopback).
 * - `device_code` — open `verificationUri` and enter `userCode` (Codex; polled).
 */
export type LoginInfo =
  | { kind: "url"; url: string }
  | { kind: "auth_code"; url: string; instructions?: string }
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

/**
 * Normalized per-turn token usage, provider-agnostic. Mirrors the frontend
 * `TokenUsage` in `@houston-ai/chat` so the context-usage indicator can read it
 * straight off a `final_result` feed item.
 *
 * `context_tokens` is the headline number: the prompt size of the most recent
 * model request, i.e. how much of the context window is in use (cache-inclusive
 * — cached tokens still occupy the window). `cached_tokens` (a subset) and
 * `output_tokens` are informational detail.
 */
export interface TokenUsage {
  context_tokens: number;
  output_tokens: number;
  cached_tokens: number;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** epoch ms */
  ts: number;
  tools?: ToolCallRecord[];
  /** Normalized usage for the turn this assistant message completed, when the
   *  provider reported it. Persisted so the context indicator survives a reload. */
  usage?: TokenUsage | null;
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
 * Live conversation events (SSE), one stream per conversation, strictly
 * id-scoped. Each SSE frame is `data: <WireEvent JSON>`.
 *
 * - `sync`  — once on connect: is a turn running + assistant text so far.
 * - `user`  — a user message was added (by any client); `nonce` echoes the sender's.
 * - `text` / `thinking` — assistant output deltas.
 * - `tool_start` / `tool_end` — tool activity within the turn.
 * - `usage` — normalized token usage for the turn (when the provider reports it),
 *   emitted before `done`. Drives the context-usage indicator.
 * - `done` / `error` — the turn ended.
 */
export type WireEvent =
  | { type: "sync"; data: { running: boolean; partial: string } }
  | { type: "user"; data: { content: string; ts: number; nonce?: string } }
  | { type: "text"; data: string }
  | { type: "thinking"; data: string }
  | { type: "tool_start"; data: { name: string; args: unknown } }
  | { type: "tool_end"; data: { name: string; isError: boolean } }
  | { type: "usage"; data: TokenUsage }
  | { type: "done"; data: null }
  | { type: "error"; data: { message: string } };

export type WireEventType = WireEvent["type"];
