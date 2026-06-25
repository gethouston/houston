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
  if (isRateLimited(lower, status)) {
    return {
      kind: "rate_limited",
      provider,
      model,
      retry_after_seconds: extractRetryAfterSeconds(message),
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
  return { kind: "unknown", provider, raw_excerpt: excerpt(message) };
}

function isAuth(lower: string, status: number | null): boolean {
  // A KNOWN non-auth status is never an auth failure: don't let loose words
  // ("authentication", "oauth") inside a 400/422/5xx body trip a reconnect card
  // the user can't act on. Rate-limit / 5xx / network own their own statuses.
  if (typeof status === "number" && status !== 401 && status !== 403)
    return false;
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
    TERMINAL_SESSION_PATTERNS.some((p) => lower.includes(p))
  );
}

function authCause(lower: string): AuthFailureCause {
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
