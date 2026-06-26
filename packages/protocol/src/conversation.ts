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
 * - `openrouter` = OpenRouter, `google` = Google Gemini,
 *   `amazon-bedrock` = Amazon Bedrock, `opencode` = OpenCode Zen,
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
  | "amazon-bedrock"
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

/**
 * Why an `unauthenticated` provider error happened. Mirrors the frontend
 * `AuthFailureCause` (`@houston-ai/chat`) so the typed reconnect card reads it
 * straight off the wire and picks the right body copy + reconnect lifecycle.
 *
 * - `no_credentials` — never connected (surfaced separately at send time, not
 *   from a live turn).
 * - `token_expired` — the credential lapsed; logging in again recovers it.
 * - `token_revoked` — the provider ended the session server-side (the terminal
 *   session-kill, e.g. Codex `app_session_terminated` / "your session has ended").
 * - `invalid_api_key` — a pasted key the provider rejected.
 */
export type AuthFailureCause =
  | "no_credentials"
  | "token_expired"
  | "token_revoked"
  | "invalid_api_key"
  | "unknown";

/**
 * Why a `model_unavailable` provider error happened. Mirrors the frontend
 * `ModelUnavailableReason` (`@houston-ai/chat`) so the wire shape stays
 * assignable to the card's union. The runtime can't always tell the precise
 * sub-reason from the gateway's flat string (GitHub Copilot just says
 * `model_not_supported`), so `unknown` is the common case; the actionable detail
 * is the `suggested_fallback`, not this tag.
 */
export type ModelUnavailableReason =
  | "preview_gated"
  | "deprecated"
  | "region_restricted"
  | "unknown";

/**
 * A typed provider/auth/model failure for a turn's model request. Mirrors the
 * relevant subset of the frontend `ProviderError` union (`@houston-ai/chat`) so
 * it renders as the matching inline card (UnauthenticatedCard / RateLimitedCard /
 * ProviderInternalCard / NetworkUnreachableCard / UnknownErrorCard). The runtime
 * classifies pi's errored `AssistantMessage` (provider + model + errorMessage)
 * into one of these — see runtime `ai/provider-error.ts`. `provider` is the pi
 * provider id; the frontend maps it to its own id when rendering.
 */
export type ProviderError =
  | {
      kind: "unauthenticated";
      provider: string;
      cause: AuthFailureCause;
      message: string;
    }
  | {
      kind: "rate_limited";
      provider: string;
      model: string | null;
      retry_after_seconds: number | null;
      message: string;
    }
  | {
      /**
       * The model the turn ran on isn't available to this credential's plan —
       * e.g. GitHub Copilot Free answers a premium model (Claude / GPT-5.x) it
       * doesn't include with `400 model_not_supported`. Distinct from auth (the
       * credential is fine) and rate/quota (nothing to wait out): the fix is to
       * pick a different model, so `suggested_fallback` names a known-good one
       * (a Copilot base model every plan serves) when we have one.
       */
      kind: "model_unavailable";
      provider: string;
      model: string;
      reason: ModelUnavailableReason;
      suggested_fallback: string | null;
      message: string;
    }
  | {
      kind: "provider_internal";
      provider: string;
      http_status: number | null;
      message: string;
    }
  | { kind: "network_unreachable"; provider: string; message: string }
  | { kind: "unknown"; provider: string; raw_excerpt: string };

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
  /**
   * Set when this turn's model request failed with a typed provider error
   * (auth / rate-limit / 5xx / network). Persisted so the inline reconnect /
   * rate-limit card survives a history reload, mirroring `providerSwitch`. The
   * carried `provider` is the pi provider id; the frontend maps it.
   */
  providerError?: ProviderError;
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
 * - `provider_error` — the turn's model request failed with a typed provider /
 *   auth / rate-limit / 5xx / network error; renders the matching inline card.
 *   The turn still ends with a normal terminal frame (pi resolves the turn — it
 *   does NOT throw on a provider error), so this never replaces `done`.
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
  | {
      /**
       * The turn's model request failed with a typed provider error
       * (401/403/session-ended → unauthenticated, 429 → rate_limited, 5xx →
       * provider_internal, network → network_unreachable, else unknown).
       * Published live so the chat renders the matching reconnect / rate-limit
       * card, and persisted on the turn's assistant message
       * (`ChatMessage.providerError`) so the card survives a reload. pi resolves
       * the turn rather than throwing, so a normal terminal frame (`done`) still
       * follows — this is NOT a substitute for it.
       */
      type: "provider_error";
      data: ProviderError;
    }
  | { type: "done"; data: null }
  | { type: "error"; data: { message: string } };

export type WireEventType = WireEvent["type"];
