/**
 * The conversation core — runtime v2, verbatim. One runtime instance serves
 * exactly this surface; the host nests it under /v1/agents/:id/conversations/*.
 * Source of truth for these shapes; @houston/runtime-client re-exports them.
 * The SSE wire frames live in wire.ts; the provider failure taxonomy in
 * provider-error.ts.
 */

import type { PendingInteraction } from "./domain/interaction";
import type { ProviderError } from "./provider-error";

/**
 * Connectable AI providers.
 * - `anthropic` = Claude Pro/Max (subscription OAuth)
 * - `openai-codex` = ChatGPT/Codex (subscription OAuth)
 * - `github-copilot` = GitHub Copilot (subscription OAuth, GitHub device-code flow)
 * - `openrouter` = OpenRouter, `deepseek` = DeepSeek, `google` = Google Gemini,
 *   `amazon-bedrock` = Amazon Bedrock, `minimax` = MiniMax global,
 *   `opencode` = OpenCode Zen, `opencode-go` = OpenCode Go: API-key
 *   (a pasted key, no OAuth). See `ProviderAuth.authKind`.
 * - `openai-compatible` = any OpenAI-compatible server the user runs (Ollama, vLLM,
 *   LM Studio, LiteLLM…): a user-supplied base URL + model id, optional key. LOCAL
 *   profile only — the URL is the user's own machine, unreachable from the cloud.
 */
export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "openrouter"
  | "deepseek"
  | "google"
  | "amazon-bedrock"
  | "minimax"
  | "opencode"
  | "opencode-go"
  | "openai-compatible"
  // Any other pi-ai provider id (the catalog is ~35 providers and drifts). The
  // `(string & {})` widening accepts any provider id on the wire while keeping
  // literal autocomplete for the named ids above.
  | (string & {});

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

/**
 * Per-turn agent execution mode. "execute" = full read/write/act (the default
 * for unpinned turns — routines and cloud turns never inherit a pinned mode);
 * "plan" = read-only tools plus a planning overlay, producing a plan for the
 * user to approve; "auto" (Autopilot) = acts with everything EXCEPT the two
 * blocking/interactive tools (`ask_user`, `request_connection`) — it never waits
 * on the user, makes its own sensible choices, and reports back at the end.
 * Deliberately NOT part of `Settings`: mode rides the per-turn pin only, so an
 * unpinned turn is always "execute".
 */
export type TurnMode = "execute" | "plan" | "auto";
export const TURN_MODES: readonly TurnMode[] = ["execute", "plan", "auto"];
export const DEFAULT_TURN_MODE: TurnMode = "execute";

/**
 * Normalize an untrusted wire value into a `TurnMode`. Only the exact known
 * literals ("execute", "plan", "auto") pass; anything else — absent, garbage,
 * wrong case — falls back to the default ("execute"). The single place both the
 * long-lived route and the cloud turn parser trust the wire, so the "never a
 * surprise mode" rule lives in one spot.
 */
export function normalizeTurnMode(value: unknown): TurnMode {
  return TURN_MODES.includes(value as TurnMode)
    ? (value as TurnMode)
    : DEFAULT_TURN_MODE;
}

export type ChatRole = "user" | "assistant";

export interface ToolCallRecord {
  name: string;
  /**
   * The tool call's arguments, exactly as the live `tool_start` frame carried
   * them. Persisted so a reloaded conversation's mission log shows WHAT each
   * tool did (the command run, the file written), not just the tool's name
   * (HOU-717). Absent on records written before this field existed.
   */
  input?: unknown;
  /**
   * The tool's output preview, as the live `tool_end` frame carried it
   * (already clipped to `TOOL_RESULT_PREVIEW_MAX` at the backend). Same
   * reload story and absence semantics as `input`.
   */
  result?: string;
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
  /**
   * The turn this message belongs to — the same id the live stream stamps on
   * the turn's wire frames (`WireFrame.turnId`). Persisted on BOTH the user
   * and assistant messages of a turn, so a client that refetches history can
   * match messages to a turn it is (or was) watching live. Absent on messages
   * written before turn ids existed.
   */
  turnId?: string;
  /**
   * Multiplayer only: who sent this message. Set on `role: "user"` turns in an
   * org so the UI can attribute a message to the teammate who wrote it. Absent
   * in single-player mode and on assistant turns.
   */
  author?: { userId: string; name?: string };
  tools?: ToolCallRecord[];
  /**
   * The turn's full reasoning text (the model's thinking blocks, concatenated
   * in stream order). Persisted so a reloaded conversation's mission log
   * replays the reasoning alongside the tool calls (HOU-717) instead of
   * dropping it. Absent on messages written before this field existed and on
   * turns that produced no reasoning.
   */
  thinking?: string;
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
   * Set on the first assistant message produced after the runtime proactively
   * compacted the conversation to stay under the context window, so the
   * boundary divider and the window reset survive a history reload. Mirrors
   * the `context_compacted` wire frame.
   */
  compaction?: {
    trigger: "native" | "proactive";
    pre_tokens?: number | null;
  };
  /**
   * User-visible workspace files this turn created or modified (relative
   * paths). Set on the assistant message only when the turn's diff was
   * non-empty, so the "files this mission touched" summary survives a history
   * reload. Mirrors the `file_changes` wire frame.
   */
  fileChanges?: { created: string[]; modified: string[] };
  /**
   * Set when this turn's model request failed with a typed provider error
   * (auth / rate-limit / 5xx / network). Persisted so the inline reconnect /
   * rate-limit card survives a history reload, mirroring `providerSwitch`. The
   * carried `provider` is the pi provider id; the frontend maps it.
   */
  providerError?: ProviderError;
  /**
   * What this turn ended waiting on the user for (ask_user / request_connection),
   * persisted ONLY when the turn ended clean (no provider error, not thrown) —
   * the exact condition that attaches it to the terminal `done` wire frame. A
   * client that MISSES the live `done` (connection blip / observer reload) and
   * settles from this history reads the interaction here and lands the board
   * card on `needs_you`, instead of dropping the question/connect card to a
   * false `done`. Absent when the turn ended with nothing outstanding.
   */
  pendingInteraction?: PendingInteraction;
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
 * A routine suggestion parsed out of Create-with-AI agent generation. The cron
 * is built and validated by the runtime from a constrained schedule set —
 * never taken raw from the model.
 */
export interface SuggestedRoutine {
  name: string;
  prompt: string;
  /** 5-field cron, built and validated by the runtime. */
  schedule: string;
}

/**
 * `POST /generate-agent` — the Create-with-AI one-shot: a plain-language
 * description in; a generated agent name, CLAUDE.md instructions, suggested
 * Composio toolkit slugs, and an optional routine suggestion out.
 */
export interface GenerateAgentResponse {
  name: string;
  instructions: string;
  /** Composio toolkit slugs (e.g. "GMAIL") the agent would genuinely use. */
  suggestedIntegrations: string[];
  suggestedRoutine: SuggestedRoutine | null;
}
