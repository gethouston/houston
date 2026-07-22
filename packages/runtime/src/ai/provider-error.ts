import { getOverflowPatterns } from "@earendil-works/pi-ai";
import type { AuthFailureCause, ProviderError } from "@houston/runtime-client";

/**
 * Classify a failed model request into a typed `ProviderError` so the chat can
 * render the matching inline card (reconnect / rate-limit / 5xx / network).
 *
 * pi does NOT throw on a provider failure: the agent loop resolves the turn and
 * hands back an `AssistantMessage` with `stopReason: "error"`, an `errorMessage`,
 * and the `provider`/`model` it ran against (see pi-agent-core `agent-loop`).
 * That message — not a caught exception — is the signal we classify here. This
 * is the TS counterpart of the legacy Rust engine's `auth_error.rs` /
 * `codex_parser.rs` / `anthropic_classify.rs` (gethouston/houston PR #490).
 *
 * pi-ai surfaces failures as a flat string (`errorMessage`), not typed classes —
 * each provider concatenates its SDK error, e.g. `"401 {…}"` (Anthropic SDK) or
 * `"OpenAI API error (429): …"` (OpenAI) or a friendly `"You have hit your
 * ChatGPT usage limit (pro plan). Try again in ~45 min."` (Codex). So we
 * classify primarily off the message text, with the HTTP status read from a
 * diagnostic when pi attached one, else parsed out of the message.
 */
export interface ProviderErrorInput {
  /** pi provider id from the errored `AssistantMessage` (`anthropic`, `openai-codex`, …). */
  provider: string;
  /** Model id from the errored `AssistantMessage`, or null when unknown. */
  model: string | null;
  /** pi's `AssistantMessage.errorMessage` — the verbatim provider failure text. */
  message: string;
  /** HTTP status when pi/diagnostics surfaced one structurally; else parsed from `message`. */
  status?: number | null;
}

/** Terminal server-side session-kill markers: the provider ENDED the session. */
const TERMINAL_SESSION_PATTERNS = [
  "app_session_terminated",
  "your session has ended",
  "session has ended",
  "session terminated",
  "session was terminated",
  "log in again",
  "login again",
];

const INVALID_KEY_PATTERNS = [
  "invalid api key",
  "invalid_api_key",
  "incorrect api key",
  "invalid x-api-key",
  "no auth credentials",
];

/**
 * The credential is simply ABSENT — the user logged out (or never connected)
 * while the provider stayed selected. pi RAISES this at prompt time (its
 * `formatNoApiKeyFoundMessage`: "No API key found for <provider>.\n\nUse /login
 * …"), it never arrives as an errored AssistantMessage, so the exec-turn /
 * turn-session catch is where this classification happens (HOU-718).
 *
 * The runtime's OWN not-connected guards belong here too: `resolveModel` /
 * `buildActiveCustomModel` throw "No provider connected. …" and "No local model
 * configured. …" BEFORE any session exists. On a brand-new conversation
 * chat.ts's getConversation catch types them directly, but on a CACHED
 * conversation the throw happens inside execTurn (resolveModel re-runs every
 * turn) and lands in ITS catch — which classifies through this function. Without
 * these patterns that path degraded to `unknown` (generic error card, no
 * reconnect flow, no undelivered-prompt auto-resume) the moment the SECOND
 * message of a chat hit a disconnected local model.
 */
const NO_CREDENTIALS_PATTERNS = [
  "no api key found",
  "no provider connected",
  "no local model configured",
];

/**
 * The gateway rejected the REQUESTED MODEL itself (not the credential): GitHub
 * Copilot answers a premium model its plan doesn't include with
 * `code: "model_not_supported"`; OpenAI uses `model_not_found` ("does not exist
 * or you do not have access to it"). High-confidence, explicit signals — kept
 * narrow so a generic permission/quota body never trips this.
 */
const MODEL_UNAVAILABLE_PATTERNS = [
  "model_not_supported",
  "model is not supported",
  "model not supported",
  // opencode.ai's ModelError body — "Model <id> is not supported" — returned,
  // oddly, under HTTP 401 (see the non-auth-401 note in `isAuth`).
  "is not supported",
  "model_not_found",
  "does not exist or you do not have access",
  // together.ai's gated-model body — "Unable to access model <id>. Please visit
  // …" — for models its serverless tier doesn't include. The credential
  // authenticated fine; only the model is out of reach.
  "unable to access model",
];

/**
 * A spend/credit exhaustion — NOT an auth failure. opencode.ai answers an
 * out-of-credit account with `401 {"type":"CreditsError","message":"Insufficient
 * balance. Manage your billing here: …"}`. Reconnecting the (valid) key does
 * nothing; the user must top up. Classified as `quota_exhausted` (the "pay or
 * switch" card), never a reconnect. HTTP 402 (Payment Required) short-circuits
 * to the same verdict regardless of body wording (see `classifyProviderError`);
 * the text patterns below catch the billing bodies that arrive WITHOUT a 402
 * status — each is tied to a real provider payload in `provider-error.test.ts`:
 * Vercel AI Gateway's no-card / verification block, Together's spend cap,
 * Anthropic's api-key credit floor, NVIDIA NIM's expired cloud credits.
 */
const INSUFFICIENT_BALANCE_PATTERNS = [
  "insufficient balance",
  "insufficient_balance",
  "insufficient credits",
  "insufficient funds",
  "not enough credits",
  "creditserror",
  // Vercel AI Gateway: `{"error":{"message":"AI Gateway requires a valid credit
  // card on file to service requests. …","type":"customer_verification_required"}}`
  "requires a valid credit card",
  "customer_verification_required",
  // Together 402: the account "has reached its maximum allowed spending limit".
  "spending limit",
  // Generic Payment Required wording / Fireworks' error `code` style.
  "payment required",
  "payment_required",
  // Anthropic api-key accounts: "Your credit balance is too low to access the
  // Anthropic API." — arrives under HTTP 400, so the 402 short-circuit misses it.
  "credit balance is too low",
  // "You have run out of credits" phrasing (various gateways).
  "out of credits",
  // NVIDIA NIM: "Cloud credits expired - Please contact NVIDIA representatives".
  "credits expired",
];

/**
 * A GitHub Copilot model EVERY Copilot plan (incl. Copilot Free) serves, offered
 * as the concrete switch target on a `model_unavailable` card. Copilot's premium
 * models (Claude, GPT-5.x) require Copilot Pro; its base models (gpt-4.1 / gpt-4o)
 * are always available. Kept in sync with `config.githubCopilotModel`'s default
 * (duplicated, not imported, so this classifier stays pure + unit-testable).
 */
const COPILOT_BASE_FALLBACK = "gpt-4.1";

/** Longest excerpt we keep for the `unknown` card / bug report. */
const EXCERPT_MAX = 300;

/**
 * Map a failed model request to a typed `ProviderError`. Pure — every branch is
 * unit-tested against verbatim provider strings (`provider-error.test.ts`).
 *
 * Precedence is deliberate: auth first (a 401/session-kill is unambiguous and
 * the most actionable, and a session-kill body can also mention "limit"), then
 * rate-limit, then 5xx, then network, then an `unknown` fallback that preserves
 * the raw text rather than guessing.
 */
export function classifyProviderError(
  input: ProviderErrorInput,
): ProviderError {
  const { provider } = input;
  const model = input.model ?? null;
  const message = input.message?.trim() || "Unknown provider error";
  const lower = message.toLowerCase();
  const status = input.status ?? extractHttpStatus(message);

  if (isAuth(lower, status)) {
    return {
      kind: "unauthenticated",
      provider,
      cause: authCause(lower),
      message,
    };
  }
  // Spend/credit exhaustion: the account is out of credit or blocked on a
  // billing precondition — the "pay or switch" state, NOT auth and NOT a
  // wait-out rate limit. Surfaces the provider's message. HTTP 402 (Payment
  // Required) is definitionally this state — Together's spend cap, Cerebras'
  // missing payment method, Fireworks' drained prepaid balance, DeepSeek's
  // "Insufficient Balance" all ride it — so the status alone decides, no body
  // wording required; the text patterns catch the same failures when a gateway
  // ships them under another status (opencode's 401 CreditsError, Anthropic's
  // 400 credit floor, Vercel's no-card block).
  if (status === 402 || isInsufficientBalance(lower)) {
    return {
      kind: "quota_exhausted",
      provider,
      model,
      scope: "unknown",
      resets_at: null,
      message,
    };
  }
  if (isRateLimited(lower, status)) {
    return {
      kind: "rate_limited",
      provider,
      model,
      retry_after_seconds: extractRetryAfterSeconds(message),
      message,
    };
  }
  // Context overflow: the conversation no longer fits the model's window —
  // never a credential/quota/server fault; the fix is a bigger-window model or
  // a fresh chat. Detected with pi-ai's per-provider pattern list (llama.cpp's
  // "exceeds the available context size", Anthropic's "prompt is too long",
  // OpenAI's context_length_exceeded, …). Checked AFTER rate-limit on purpose:
  // that ordering is pi's own non-overflow exclusion — a throttling body like
  // Bedrock's "Too many tokens, please wait" must stay a rate limit even
  // though it matches the generic /too many tokens/ overflow pattern. Carries
  // the provider's own numbers so the card can name them and the runtime can
  // learn a custom endpoint's real window (`learnCustomContextWindow`).
  if (isContextOverflow(message)) {
    return {
      kind: "context_overflow",
      provider,
      model,
      context_window_tokens: extractContextWindowTokens(message),
      prompt_tokens: extractPromptTokens(message),
      message,
    };
  }
  if (isServerError(lower, status)) {
    return {
      kind: "provider_internal",
      provider,
      http_status: status ?? null,
      message,
    };
  }
  if (isNetwork(lower)) {
    return { kind: "network_unreachable", provider, message };
  }
  // The credential is fine; the chosen MODEL just isn't available on this plan
  // (Copilot premium model on Copilot Free, etc.). Needs a known model id to
  // render the "switch model" card — without one it can't name what to switch
  // away from, so it falls through to `unknown`.
  if (model && isModelUnavailable(lower)) {
    return {
      kind: "model_unavailable",
      provider,
      model,
      reason: "unknown",
      // Offer a concrete switch target only when we know one AND it isn't the
      // failing model itself (a base Copilot model never reports unavailable).
      suggested_fallback:
        provider === "github-copilot" && model !== COPILOT_BASE_FALLBACK
          ? COPILOT_BASE_FALLBACK
          : null,
      message,
    };
  }
  return { kind: "unknown", provider, raw_excerpt: excerpt(message) };
}

function isAuth(lower: string, status: number | null): boolean {
  // A KNOWN non-auth status is never an auth failure: don't let loose words
  // ("authentication", "oauth") inside a 400/422/5xx body trip a reconnect card
  // the user can't act on. Rate-limit / 5xx / network own their own statuses.
  if (typeof status === "number" && status !== 401 && status !== 403)
    return false;
  // Some OpenAI-compatible gateways OVERLOAD 401 for non-auth failures: opencode.ai
  // answers "Insufficient balance" (CreditsError) and "Model <id> is not supported"
  // (ModelError) with HTTP 401. The credential is valid — reconnecting fixes
  // neither — so a 401 whose body names one of those must fall through to the
  // quota / model-unavailable branches, never the reconnect card.
  if (isInsufficientBalance(lower) || isModelUnavailable(lower)) return false;
  // 401 is always authentication. 403 is ambiguous — Anthropic uses it for
  // authorization (`permission_error`), which re-logging-in won't fix — so a
  // 403 only counts as auth when the body itself names an auth failure (below).
  if (status === 401) return true;
  return (
    lower.includes("unauthorized") ||
    lower.includes("unauthenticated") ||
    lower.includes("authentication") ||
    lower.includes("not logged in") ||
    // "oauth token" (not bare "oauth"): a token error, not any mention of OAuth.
    lower.includes("oauth token") ||
    INVALID_KEY_PATTERNS.some((p) => lower.includes(p)) ||
    NO_CREDENTIALS_PATTERNS.some((p) => lower.includes(p)) ||
    TERMINAL_SESSION_PATTERNS.some((p) => lower.includes(p))
  );
}

function authCause(lower: string): AuthFailureCause {
  if (NO_CREDENTIALS_PATTERNS.some((p) => lower.includes(p)))
    return "no_credentials";
  if (INVALID_KEY_PATTERNS.some((p) => lower.includes(p)))
    return "invalid_api_key";
  // The provider ended this session server-side — the user must reconnect, a
  // simple token refresh won't recover it. The legacy `is_terminal_auth_error`.
  if (
    lower.includes("revoked") ||
    TERMINAL_SESSION_PATTERNS.some((p) => lower.includes(p))
  )
    return "token_revoked";
  if (lower.includes("expired")) return "token_expired";
  return "unknown";
}

function isRateLimited(lower: string, status: number | null): boolean {
  if (status === 429) return true;
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("ratelimit") ||
    lower.includes("too many requests") ||
    // Bedrock prefixes throttling as "Throttling error: Too many tokens, …" —
    // semantically a rate limit, and matching it here is what keeps it out of
    // the context-overflow branch below (pi's own non-overflow exclusion).
    lower.includes("throttl") ||
    lower.includes("usage limit") ||
    lower.includes("usage_limit") ||
    lower.includes("quota")
  );
}

function isServerError(lower: string, status: number | null): boolean {
  if (typeof status === "number" && status >= 500 && status <= 599) return true;
  return (
    lower.includes("internal server error") ||
    lower.includes("service unavailable") ||
    lower.includes("bad gateway") ||
    lower.includes("gateway timeout") ||
    lower.includes("overloaded")
  );
}

function isNetwork(lower: string): boolean {
  return (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("eai_again") ||
    lower.includes("socket hang up") ||
    lower.includes("network error") ||
    lower.includes("connection refused") ||
    lower.includes("connection reset")
  );
}

function isModelUnavailable(lower: string): boolean {
  return MODEL_UNAVAILABLE_PATTERNS.some((p) => lower.includes(p));
}

function isContextOverflow(message: string): boolean {
  return getOverflowPatterns().some((p) => p.test(message));
}

/**
 * The model's REAL context window from an overflow rejection, when the provider
 * named it: llama.cpp's structured `"n_ctx":8192` / prose "context size (8192
 * tokens)", OpenAI's "maximum context length is 128000 tokens", Anthropic's
 * "N tokens > 200000 maximum". Null when no plausible number is present.
 */
export function extractContextWindowTokens(message: string): number | null {
  const m =
    message.match(/"n_ctx"\s*:\s*(\d+)/) ??
    message.match(/context size \((\d+)\s*tokens?\)/i) ??
    message.match(/maximum context length is (\d+)/i) ??
    message.match(/>\s*(\d+)\s*maximum/i);
  return m ? positiveInt(m[1]) : null;
}

/**
 * The rejected request's prompt size from an overflow rejection, when the
 * provider named it: llama.cpp's `"n_prompt_tokens":15246` / prose "request
 * (15246 tokens)", Anthropic's "prompt is too long: N tokens".
 */
export function extractPromptTokens(message: string): number | null {
  const m =
    message.match(/"n_prompt_tokens"\s*:\s*(\d+)/) ??
    message.match(/request \((\d+)\s*tokens?\)/i) ??
    message.match(/too long:?\s*(\d+)\s*tokens?/i);
  return m ? positiveInt(m[1]) : null;
}

function positiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isInsufficientBalance(lower: string): boolean {
  return INSUFFICIENT_BALANCE_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Pull an HTTP status out of a provider error string. Handles the two shapes pi
 * emits: parenthesized (`"OpenAI API error (429): …"`) and leading (the
 * Anthropic SDK's `"401 {…}"`), plus an explicit `status: NNN` label. Returns
 * null when no plausible status (100–599) is present.
 */
export function extractHttpStatus(message: string): number | null {
  const paren = message.match(/\((\d{3})\)/);
  if (paren) {
    const n = Number(paren[1]);
    if (n >= 100 && n <= 599) return n;
  }
  const lead = message.match(/^\s*(\d{3})\b/);
  if (lead) {
    const n = Number(lead[1]);
    if (n >= 100 && n <= 599) return n;
  }
  const labelled = message.match(/(?:status|http)[^\d]{0,4}(\d{3})\b/i);
  if (labelled) {
    const n = Number(labelled[1]);
    if (n >= 100 && n <= 599) return n;
  }
  return null;
}

// Lead-in words a retry window follows in real provider messages, e.g.
// "…Please try again in 2.5s", "resets in 30 seconds", "available in 45 min".
const RETRY_LEAD = "(?:try again|retry|resets?|available|wait)";

/**
 * Best-effort retry window in seconds from a rate-limit message. Reads the RFC
 * `retry-after` header value when echoed, plus the human phrasings providers
 * actually emit — crucially the most common OpenAI/Codex 429 form with a bare,
 * often FRACTIONAL unit ("Please try again in 2.5s.", "…540ms", "…45 min").
 * Sub-second waits round up to a 1s countdown. Capped at 24h; null when nothing
 * parseable is present (the card then omits the countdown).
 *
 * Unit order matters: match `ms` before bare `s`, and `min` before bare `m`.
 */
export function extractRetryAfterSeconds(message: string): number | null {
  const header = message.match(/retry[\s-]?after[:\s]+(\d+(?:\.\d+)?)/i);
  if (header) return clampSeconds(Math.ceil(Number(header[1])));
  const ms = message.match(
    new RegExp(`${RETRY_LEAD}\\D{0,16}?(\\d+(?:\\.\\d+)?)\\s*ms\\b`, "i"),
  );
  if (ms) return clampSeconds(Math.ceil(Number(ms[1]) / 1000));
  const mins = message.match(
    new RegExp(
      `${RETRY_LEAD}\\D{0,16}?(\\d+(?:\\.\\d+)?)\\s*m(?:in(?:ute)?s?)?\\b`,
      "i",
    ),
  );
  if (mins) return clampSeconds(Math.round(Number(mins[1]) * 60));
  const secs = message.match(
    new RegExp(
      `${RETRY_LEAD}\\D{0,16}?(\\d+(?:\\.\\d+)?)\\s*s(?:ec(?:ond)?s?)?\\b`,
      "i",
    ),
  );
  if (secs) return clampSeconds(Math.ceil(Number(secs[1])));
  return null;
}

function clampSeconds(n: number): number | null {
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), 86_400);
}

function excerpt(message: string): string {
  return message.length > EXCERPT_MAX
    ? `${message.slice(0, EXCERPT_MAX)}…`
    : message;
}
