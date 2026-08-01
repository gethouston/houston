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
  /**
   * WHOSE credential produced `configured` (HOU-976), so the model picker can
   * label a row "your account". OMITTED unless the request carried an acting
   * identity — desktop, self-host, routines and every pre-HOU-976 caller see
   * the exact shape they saw before, so treat absence as "one credential,
   * nothing to disambiguate".
   */
  credentialScope?: "personal" | "team";
}

// ── Per-account provider usage (GET /providers/usage) ───────────────────────

/**
 * Stable rate-limit window identifiers, mapped to translated labels by the
 * frontend: `session` = the short rolling window (Claude 5h, Codex primary),
 * `week`/`week_opus` = 7-day windows, `month` = monthly, and
 * `premium`/`chat`/`completions` = Copilot's quota lanes.
 */
export type ProviderUsageWindowId =
  | "session"
  | "week"
  | "week_opus"
  | "month"
  | "premium"
  | "chat"
  | "completions";

/** One rolling rate-limit window on a connected provider account. */
export interface ProviderUsageWindow {
  id: ProviderUsageWindowId;
  /** 0–100, clamped runtime-side; never NaN. */
  usedPercent: number;
  /** ISO 8601 instant the window resets, when the provider reports one. */
  resetsAt: string | null;
  /** Window length in minutes, when the provider reports one (300 = 5h). */
  windowMinutes?: number;
}

/** Prepaid balance for API-key providers that expose one. */
export interface ProviderUsageCredits {
  remaining: number;
  /** Total granted, when reported. */
  granted?: number;
  unit: "USD" | "credits";
}

/**
 * Cumulative token spend metered locally by Houston, for API-key providers
 * with no account-usage API to probe (Gemini, Bedrock, OpenCode, MiniMax,
 * custom endpoints). Accumulated from each turn's `TokenUsage` by the
 * long-lived runtime: `inputTokens` sums every request's full prompt
 * (cache-inclusive, what the provider bills as input), `outputTokens` sums
 * generated tokens.
 */
export interface ProviderUsageTokens {
  inputTokens: number;
  outputTokens: number;
  /** Turns metered into this row. */
  turns: number;
  /** ISO 8601 instant metering started (the first recorded turn). */
  since: string;
}

export type ProviderUsageStatus =
  | "ok"
  | "unsupported" // the provider has no usage surface Houston can read
  | "unauthenticated" // no readable credential for the usage probe
  | "error"; // the probe failed (network, provider outage, bad payload)

/**
 * One connected provider account's live usage — rate-limit windows for
 * subscription providers, a credit balance for prepaid API keys. One row per
 * CONNECTED provider; unreadable providers report an honest non-`ok` status
 * instead of being omitted.
 */
export interface ProviderUsage {
  provider: ProviderId;
  status: ProviderUsageStatus;
  windows: ProviderUsageWindow[];
  credits?: ProviderUsageCredits;
  /** Locally metered token spend, for providers with no usage API to probe. */
  tokens?: ProviderUsageTokens;
  /** Plan/tier name when the provider reports one (e.g. Codex "pro"). */
  plan?: string;
  /** ISO 8601 instant the row was fetched (`ok` rows only). */
  fetchedAt?: string;
  /** Human-readable failure detail (`error` rows only; never a secret). */
  message?: string;
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
  /**
   * Share this endpoint with the active organization. Only meaningful when
   * saving in managed cloud; ignored by desktop and self-hosted runtimes.
   */
  shared?: boolean;
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
 * for unpinned turns; routine fire paths explicitly pin "auto"); "plan" =
 * read-only tools plus a planning overlay, producing a plan for the user to
 * approve; "auto" (Autopilot) = acts with everything EXCEPT the two
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
  /**
   * What renders as the user's chat bubble, when it must differ from `content`
   * (the text the model received). Presentation-only metadata: set on
   * `role: "user"` turns whose real prompt carries text the user should never
   * see — a hidden setup-mission directive, or absolute attachment paths
   * appended to the prompt. A client replaying history renders
   * `displayText ?? content`; the model always ran on `content`. Absent on every
   * turn where the bubble and the prompt are the same string.
   */
  displayText?: string;
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
  /**
   * The teammates this message @mentions (HOU-944). Set on `role: "user"` turns
   * whose text names people from the space roster: the model only ever sees the
   * plain "@Name" text, and this structured sidecar is what lets a reader match
   * a mention to a person — it is the scan key a notifications/inbox feature
   * reads (`mentions[].userId === me`). Purely additive: absent on every message
   * that mentions nobody, on single-player turns, and on assistant turns, whose
   * "@Name" is plain text with no structure behind it.
   */
  mentions?: { userId: string; name?: string }[];
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
   * What this turn ended on — a question / connect the user has to answer
   * (ask_user / request_connection), or an optional clean-finish offer —
   * persisted ONLY when the turn ended clean (no provider error, not thrown):
   * the exact condition that attaches it to the terminal `done` wire frame. A
   * client that MISSES the live `done` (connection blip / observer reload) and
   * settles from this history reads the interaction here, so its `needs_you`
   * card renders exactly what the live frame would have shown instead of a bare
   * finish. Absent when the turn ended with nothing outstanding.
   */
  pendingInteraction?: PendingInteraction;
  /**
   * Set on the assistant message when the user interrupted this turn — the Stop
   * button, or dismissing the composer-replacing interaction card. Persisted so
   * the standard "Stopped by user" line survives a history reload, and so the
   * reload derivation renders the interruption instead of a plain successful
   * finish. Absent on turns that ran to completion.
   */
  stopped?: true;
}

/** The most @mentions one message may carry; the rest are dropped. */
export const MENTIONS_MAX = 32;

/** Longest `userId` a mention may carry. Comfortably past every id we mint
 *  (a Firebase uid is 28 characters), short of letting one entry carry a
 *  payload. Longer ones are truncated, not dropped: the id still has to match
 *  a real member downstream to mean anything. */
export const MENTION_USER_ID_MAX = 128;

/** Longest display `name` a mention may carry — a generous full name, not a
 *  document. Truncated rather than dropped, because the userId is the
 *  load-bearing half and a garbled name must never cost the user the mention. */
export const MENTION_NAME_MAX = 256;

/** How many raw entries are inspected before the scan gives up. A junk array
 *  is not worth walking in full: {@link MENTIONS_MAX} valid mentions can never
 *  be more than this many entries in, and anything longer is not a send this
 *  system produced. */
export const MENTIONS_SCAN_MAX = 1000;

/**
 * Normalize an untrusted wire value into {@link ChatMessage.mentions}. Sibling
 * of {@link normalizeTurnMode}: the single place every reader of a send body
 * trusts the wire, so the send route, the cloud turn parser and the host's
 * forwarding hop all agree on what a mention is.
 *
 * Anything but an array is nothing. An entry survives only as a plain object
 * with a non-empty string `userId`; `name` rides along only when it is a
 * string. Both are clipped to their length caps. The FIRST entry for a userId
 * wins, so a repeated id cannot spend the budget. Invalid entries are dropped
 * rather than failing the turn — a bad sidecar must never cost the user their
 * message — the result is capped at {@link MENTIONS_MAX}, the scan itself
 * stops after {@link MENTIONS_SCAN_MAX} entries, and an empty result is
 * `undefined`, never `[]`.
 */
export function parseMentions(value: unknown): ChatMessage["mentions"] {
  if (!Array.isArray(value)) return undefined;
  const out: NonNullable<ChatMessage["mentions"]> = [];
  const seen = new Set<string>();
  const scanned = Math.min(value.length, MENTIONS_SCAN_MAX);
  for (let i = 0; i < scanned; i += 1) {
    if (out.length >= MENTIONS_MAX) break;
    const entry = value[i];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      continue;
    const { userId, name } = entry as { userId?: unknown; name?: unknown };
    if (typeof userId !== "string" || !userId) continue;
    const id = userId.slice(0, MENTION_USER_ID_MAX);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(
      typeof name === "string"
        ? { userId: id, name: name.slice(0, MENTION_NAME_MAX) }
        : { userId: id },
    );
  }
  return out.length ? out : undefined;
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
  /**
   * Absolute index of `messages[0]` in the full transcript — `0` when the
   * response starts at the beginning. Non-zero only on a windowed read
   * (`?limit=` / `?before=`): older messages exist below this index and are
   * fetched with `before: offset`. Absent on pre-windowing servers (treat as
   * `0` — the response is the whole transcript).
   */
  offset?: number;
  /**
   * Total messages stored in the conversation, regardless of the window
   * returned. Absent on pre-windowing servers (treat as `messages.length`).
   */
  totalMessages?: number;
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
