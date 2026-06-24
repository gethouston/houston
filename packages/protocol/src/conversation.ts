/**
 * The conversation core — runtime v2, verbatim. One runtime instance serves
 * exactly this surface; the host nests it under /v1/agents/:id/conversations/*.
 * Source of truth for these shapes; @houston/runtime-client re-exports them.
 */

/**
 * Connectable AI providers.
 * - `anthropic` = Claude Pro/Max (subscription OAuth)
 * - `openai-codex` = ChatGPT/Codex (subscription OAuth)
 * - `github-copilot` = GitHub Copilot (subscription OAuth, GitHub device-code flow)
 * - `openrouter` = OpenRouter, `google` = Google Gemini, `opencode` = OpenCode Zen,
 *   `opencode-go` = OpenCode Go: API-key (a pasted key, no OAuth). See `ProviderAuth.authKind`.
 * - `openai-compatible` = any OpenAI-compatible server the user runs (Ollama, vLLM,
 *   LM Studio, LiteLLM…): a user-supplied base URL + model id, optional key. LOCAL
 *   profile only — the URL is the user's own machine, unreachable from the cloud.
 */
export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "openrouter"
  | "google"
  | "opencode"
  | "opencode-go"
  | "openai-compatible";

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
  /**
   * For a connected `github-copilot` credential, the GitHub Copilot Enterprise
   * domain it was issued for (e.g. `acme.ghe.com`), or null for individual
   * Copilot. Lets the connect UI tell the "GitHub Copilot Enterprise" card apart
   * from the individual one — both are the same engine provider, distinguished
   * only by this domain. Absent/null for every other provider.
   */
  enterpriseUrl?: string | null;
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

/**
 * The OpenAI-compatible (local) endpoint a user connects: a base URL pointing at
 * their own server (Ollama / vLLM / LM Studio) plus the model id it serves. The
 * key is optional — keyless local servers ignore it. LOCAL profile only.
 */
export interface CustomEndpoint {
  baseUrl: string;
  model: string;
  /** Friendly label for the picker; defaults to the model id. */
  name?: string;
  /** Assumed context window (tokens); defaults to the runtime's configured value. */
  contextWindow?: number;
  /** Whether to send `reasoning_effort` (only set for a reasoning-capable model). */
  reasoning?: boolean;
  /** Optional API key; blank for keyless servers. */
  apiKey?: string;
}

export interface Settings {
  activeProvider?: ProviderId;
  models?: Partial<Record<ProviderId, string>>;
  /**
   * The agent's reasoning-effort setting, applied to each turn (the runtime maps
   * it to pi's thinking level and clamps to the active model). Absent = the
   * model's own default.
   */
  effort?: string;
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
  /**
   * Set on the first assistant message produced after a mid-session provider
   * switch, so the boundary divider and the context-usage window reset survive a
   * history reload. `provider` is the pi provider id switched TO; `summarized` is
   * whether prior context was compacted to fit the new model's window.
   */
  providerSwitch?: {
    provider: string;
    summarized: boolean;
    pre_tokens?: number | null;
  };
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
 * - `provider_switched` — the conversation moved to a different provider
 *   mid-session; renders a boundary divider and resets the context-usage window.
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
  | {
      /**
       * The conversation moved to a different provider mid-session. The runtime
       * re-pointed the live session to the new provider, carrying the full prior
       * history verbatim when it fit (`summarized: false`) or compacting it to
       * fit a smaller window first (`summarized: true`). `provider` is the pi
       * provider id switched TO; `pre_tokens` is the leaving provider's last
       * context fill. Drives the chat's boundary divider + the context-usage
       * window reset.
       */
      type: "provider_switched";
      data: {
        provider: string;
        summarized: boolean;
        pre_tokens?: number | null;
      };
    }
  | { type: "done"; data: null }
  | { type: "error"; data: { message: string } };

export type WireEventType = WireEvent["type"];
