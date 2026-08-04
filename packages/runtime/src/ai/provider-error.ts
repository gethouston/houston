import { getOverflowPatterns } from "@earendil-works/pi-ai";
import type { AuthFailureCause, ProviderError } from "@houston/runtime-client";
import { servedScopeFor } from "../auth/served-scope";

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

/**
 * Terminal server-side session-kill markers: the provider ENDED the session.
 *
 * Loose on purpose — these drive CARD COPY ("your access was revoked, sign in
 * again"), which is the right thing to say about any 401 that reads terminal,
 * and being wrong costs nothing but a reconnect prompt. They must never drive a
 * destructive action: the workspace-wide revoked-token report gates on its own,
 * strict marker list (`auth/report-revoked.ts`), so a provider that phrases a
 * transient blip as "please log in again" cannot delete a live credential. Add
 * loose phrasings here freely; add to that list almost never.
 */
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
  // Alibaba Model Studio / Qwen Token Plan gateways: 401
  // `{"message":"Invalid API-key provided. …","code":"invalid_api_key"}` —
  // "API-key" is hyphenated, so the plain "invalid api key" pattern misses it.
  "invalid api-key",
  // NVIDIA NIM rejects a bad/revoked key with 403
  // `{"status":403,"title":"Forbidden","detail":"Authorization failed"}` —
  // no "unauthorized"/"authentication" wording, so without this pattern it
  // classified `unknown` (generic error card instead of the reconnect card,
  // and "could not verify" instead of "didn't accept this key") (HOU-1077).
  "authorization failed",
  // Google Gemini API keys: 403 with `"status": "PERMISSION_DENIED"` — the
  // key's GCP project is blocked ("Your project has been denied access.
  // Please contact support.") or otherwise not permitted to call the API. The
  // whole credential is unusable, so the remedy is pasting a different key —
  // the reconnect card, never the report-bug `unknown` card (HOU-920).
  // "permission_denied" is Google's canonical gRPC status label; Anthropic's
  // resource-level authZ marker is "permission_error", which deliberately
  // stays OUT of this list (re-keying doesn't fix it — see the 403 note in
  // `isAuth` and its test).
  "permission_denied",
  "project has been denied access",
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
 *
 * pi 0.82's ModelRuntime renamed the missing-credential failure: `applyAuth`
 * now raises ModelsError("auth", "Provider is not configured: <id>") when its
 * credential store resolves nothing for the model's provider — and pi catches
 * that internally, so it ARRIVES as an errored AssistantMessage (the wire.ts
 * turn_end path), unlike the older prompt-time raise. A turn pinned to a
 * disconnected provider (pins are deliberately never auth-gated) hits exactly
 * this; without the pattern it degraded to `unknown` — the generic error card
 * instead of the reconnect card (HOU-956: "Provider is not configured:
 * google" after a Gemini model was picked with no google key stored).
 */
const NO_CREDENTIALS_PATTERNS = [
  "no api key found",
  "no provider connected",
  "no local model configured",
  "provider is not configured",
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
  // GitHub Copilot's newer 400 body — `The requested model is not available
  // for integrator "vscode-chat". Available models: […]` — same plan-doesn't-
  // serve-this-model failure as its older `model_not_supported` code (HOU-977).
  "requested model is not available",
  // opencode.ai's region gate: 403 `{"type":"RegionError","message":"The
  // latest version of this model is only available hosted in China and
  // requires explicit opt in: <url>"}` — the credential is fine; the MODEL
  // needs a region opt-in, so the switch-model card is the honest one
  // (HOU-1156). The type name carries the `region_restricted` reason.
  "regionerror",
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
  // Google Cloud's billing-delinquency denial: 403 `"Lightning dunning
  // decision is deny for project: projects/…"` — the project's billing is past
  // due, so paying (not reconnecting) is the fix (HOU-1156).
  "dunning decision is deny",
];

/**
 * The PLAN's token/usage allowance is spent — same "pay or switch" outcome as a
 * credit exhaustion, NOT a wait-a-moment rate limit (HOU-1154: OpenAI rendered
 * the rate-limit card — "Alcanzaste un límite de velocidad" — when the account
 * simply had no tokens left). Both OpenAI shapes ride HTTP 429, identical to a
 * genuine burst limit, so the BODY decides and this check must run BEFORE the
 * rate-limit branch:
 *  - API key accounts: `insufficient_quota` / "You exceeded your current quota,
 *    please check your plan and billing details."
 *  - ChatGPT OAuth (Codex) plans: "You have hit your ChatGPT usage limit (pro
 *    plan). Try again in ~45 min." (also `usage_limit_reached`).
 * Bare "quota" stays in `isRateLimited`: per-minute quota bodies (Gemini's
 * "Quota exceeded for quota metric '… requests per minute'") ARE rate limits.
 */
const PLAN_LIMIT_PATTERNS = [
  "insufficient_quota",
  "exceeded your current quota",
  "usage limit",
  "usage_limit",
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
 * Map a failed model request to a typed `ProviderError`, then stamp WHOSE
 * credential ran the turn (`stampCredentialScope`).
 *
 * Precedence is deliberate: auth first (a 401/session-kill is unambiguous and
 * the most actionable, and a session-kill body can also mention "limit"), then
 * rate-limit, then 5xx, then network, then an `unknown` fallback that preserves
 * the raw text rather than guessing.
 */
export function classifyProviderError(
  input: ProviderErrorInput,
): ProviderError {
  return stampCredentialScope(classify(input));
}

/**
 * Attach the credential context of the turn that failed: WHICH credential the
 * gateway served for this provider under the ambient acting identity (HOU-976),
 * so the card can name the account that hit the wall rather than the provider
 * alone. It unlocks no action — a team space has no shared AI credential to
 * offer instead.
 *
 * A no-op without an acting identity (desktop, self-host, routines) and for a
 * provider this runtime was never served, so the wire shape is unchanged
 * everywhere it was before. Exported for the paths that SYNTHESIZE a provider
 * error instead of classifying one.
 */
export function stampCredentialScope(err: ProviderError): ProviderError {
  const served = servedScopeFor(err.provider);
  if (!served) return err;
  return { ...err, credential: { scope: served } };
}

/**
 * The classification itself. Pure — every branch is unit-tested against
 * verbatim provider strings (`provider-error.test.ts`).
 */
function classify(input: ProviderErrorInput): ProviderError {
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
  // 400 credit floor, Vercel's no-card block). Plan-allowance exhaustion
  // (OpenAI `insufficient_quota`, ChatGPT usage limit) is the same verdict and
  // MUST be decided here, before the rate-limit branch claims its 429 (HOU-1154).
  if (status === 402 || isInsufficientBalance(lower) || isPlanLimit(lower)) {
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
      reason: modelUnavailableReason(lower),
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
    // Bare "quota" belongs here (per-minute quota bodies are throttling);
    // plan-allowance exhaustion is claimed earlier by `isPlanLimit` (HOU-1154).
    lower.includes("throttl") ||
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
    lower.includes("overloaded") ||
    // opencode.ai's gateway body when its upstream stream breaks mid-response —
    // often with no status at all. Transient; retry helps (HOU-929).
    lower.includes("streaming response failed") ||
    // OpenAI-compatible streams that END with an abnormal `finish_reason`:
    // OpenRouter answers `finish_reason: "error"` when the UPSTREAM provider
    // died mid-generation (its error detail rides a separate field pi-ai does
    // not surface), and some gateways emit `"network_error"` for the same
    // break. pi-ai flattens both to `Provider finish_reason: <reason>` with no
    // status and no body. Server-side and transient — retry helps — so they
    // read as provider_internal, never the report-bug `unknown` (HOU-930).
    // Deliberately NOT a bare `finish_reason:` match: `content_filter` (a
    // policy refusal, not an outage) must keep falling through to `unknown`.
    lower.includes("finish_reason: error") ||
    lower.includes("finish_reason: network_error") ||
    // OpenRouter when the upstream closes the stream without ever sending a
    // finish_reason — the same mid-generation upstream death as
    // `finish_reason: error` above (HOU-930 family), flattened by pi-ai with
    // no status and no body (HOU-1156).
    lower.includes("stream ended without finish_reason") ||
    // Google (Gemini) overload arrives as a gRPC-style prefix with the real
    // status buried in nested JSON: `got status: UNAVAILABLE. {"error":
    // {"code":503,"message":"This model is currently experiencing high
    // demand …"}}`. The embedded `"code"` extractor usually recovers the 503;
    // these keep the verdict when the body is truncated (HOU-1156).
    lower.includes("got status: unavailable") ||
    lower.includes("experiencing high demand") ||
    // Codex (ChatGPT OAuth) rides a WebSocket transport; when that socket dies
    // mid-turn pi-ai flattens it to `WebSocket closed <code>` — no status, no
    // body (HOU-848: codes 1006 abnormal closure, 1000 server closed mid-turn,
    // 1012 service restart, all seen in the wild). HOU-1156 first classified
    // this as network_unreachable, but every production event originates on a
    // cloud engine pod, where "check your internet" points at the wrong
    // network — the pod↔OpenAI socket broke, not the user's connection. The
    // provider_internal card ("<provider> is having a problem, try again") is
    // the honest one in both deployments: retry is the remedy either way, and
    // a genuinely dead local network fails the NEXT attempt with fetch/ECONN
    // errors that still route to network_unreachable below.
    lower.includes("websocket closed") ||
    // OpenAI's generic server-side failure body — "An error occurred while
    // processing your request. You can retry your request, or contact us
    // through our help center at help.openai.com if the error persists.
    // Please include the request ID <uuid> …" — the standard 500/server_error
    // wording, but the Codex path flattens it to "Codex error: <body>" with NO
    // status, so the 5xx short-circuit above never sees it. The body itself
    // says retry helps; without this pattern it degraded to the report-bug
    // `unknown` card (HOU-898).
    lower.includes("error occurred while processing your request")
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

/**
 * The card copy keys off the message either way; the tag exists for the
 * frontend union. Only region gating is identifiable from real payloads today
 * (opencode.ai's RegionError / "hosted in China" opt-in body).
 */
function modelUnavailableReason(
  lower: string,
): "region_restricted" | "unknown" {
  return lower.includes("regionerror") || lower.includes("hosted in china")
    ? "region_restricted"
    : "unknown";
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

function isPlanLimit(lower: string): boolean {
  return PLAN_LIMIT_PATTERNS.some((p) => lower.includes(p));
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
  // Some providers carry the status ONLY as a JSON `"code"` field — Google's
  // nested `{"error":{"code":503,…}}`, often double-encoded so the quote
  // arrives escaped (`\"code\": 503`). Last resort, and restricted to 4xx/5xx:
  // a 3-digit `"code"` in that range is an HTTP status in every payload we
  // have seen, while accepting 1xx–3xx would let a stray application code veto
  // the auth branch's known-non-auth-status check (HOU-1156).
  const embedded = message.match(/"code"\s*:\s*"?([45]\d{2})\b/);
  if (embedded) return Number(embedded[1]);
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
