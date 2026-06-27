import { expect, test } from "vitest";
import {
  classifyProviderError,
  extractHttpStatus,
  extractRetryAfterSeconds,
} from "./provider-error";

// Fixtures are verbatim-shaped provider failure strings: the Anthropic SDK
// prefixes the status (`"401 {…}"`); OpenAI/Codex use `"OpenAI API error (NNN): …"`
// or a friendly usage-limit sentence. The classifier must read all of them.

test("Anthropic OAuth 401 → unauthenticated / token_expired", () => {
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-opus-4-8",
    message:
      '401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired"}}',
  });
  expect(err).toEqual({
    kind: "unauthenticated",
    provider: "anthropic",
    cause: "token_expired",
    message:
      '401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired"}}',
  });
});

test("Anthropic invalid key 401 → unauthenticated / invalid_api_key", () => {
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-opus-4-8",
    message:
      '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("invalid_api_key");
});

test("Codex session-kill → unauthenticated / token_revoked (terminal, not transient)", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    message:
      "OpenAI API error (401): Your session has ended. Please log in again. (app_session_terminated)",
  });
  expect(err.kind).toBe("unauthenticated");
  // Terminal session-kill: the user must reconnect, not silently refresh.
  if (err.kind === "unauthenticated") expect(err.cause).toBe("token_revoked");
});

test("Anthropic 403 permission_error (authZ) is NOT a reconnect prompt → unknown", () => {
  // A 403 permission_error is authorization, not authentication — re-logging-in
  // won't fix it, so it must NOT render the reconnect card. Only 401 (or a 403
  // whose body names an auth failure) is unauthenticated.
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-opus-4-8",
    message:
      '403 {"type":"error","error":{"type":"permission_error","message":"Your API key does not have permission to use the specified resource"}}',
  });
  expect(err.kind).not.toBe("unauthenticated");
  expect(err.kind).toBe("unknown");
});

test("a known non-auth status ignores loose auth words in the body (no false reconnect)", () => {
  // A 400 invalid_request that merely mentions an "authentication header" must
  // not be read as an auth failure — the status is definitively non-auth.
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-opus-4-8",
    message:
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content: authentication header note"}}',
  });
  expect(err.kind).not.toBe("unauthenticated");
});

test("OpenAI 429 with the standard fractional 'try again in N.Ns' window → retry parsed", () => {
  // The most common real 429 phrasing: a bare 's' suffix with a fractional value.
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    message:
      "OpenAI API error (429): Rate limit reached for gpt-5.1 on tokens per min (TPM): Limit 30000, Used 28500, Requested 2000. Please try again in 2.5s.",
  });
  expect(err.kind).toBe("rate_limited");
  if (err.kind === "rate_limited") expect(err.retry_after_seconds).toBe(3);
});

test("Anthropic 429 → rate_limited (no retry window in body → null), carries model", () => {
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-opus-4-8",
    message:
      '429 {"type":"error","error":{"type":"rate_limit_error","message":"Number of requests has exceeded your per-minute rate limit"}}',
  });
  expect(err).toEqual({
    kind: "rate_limited",
    provider: "anthropic",
    model: "claude-opus-4-8",
    retry_after_seconds: null,
    message:
      '429 {"type":"error","error":{"type":"rate_limit_error","message":"Number of requests has exceeded your per-minute rate limit"}}',
  });
});

test("Codex usage limit → rate_limited with retry window parsed from minutes", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    message:
      "You have hit your ChatGPT usage limit (pro plan). Try again in ~45 min.",
  });
  expect(err.kind).toBe("rate_limited");
  if (err.kind === "rate_limited") {
    expect(err.retry_after_seconds).toBe(45 * 60);
    expect(err.model).toBe("gpt-5.1-codex");
  }
});

test("OpenAI 429 with retry-after header echoed → rate_limited / retry_after_seconds", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    message: "OpenAI API error (429): Rate limit reached. retry-after: 30",
  });
  expect(err.kind).toBe("rate_limited");
  if (err.kind === "rate_limited") expect(err.retry_after_seconds).toBe(30);
});

test("Anthropic 529 overloaded → provider_internal with http_status", () => {
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-opus-4-8",
    message:
      '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
  });
  expect(err).toEqual({
    kind: "provider_internal",
    provider: "anthropic",
    http_status: 529,
    message:
      '529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
  });
});

test("OpenAI 500 → provider_internal with http_status 500", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    message:
      "OpenAI API error (500): The server had an error processing your request.",
  });
  expect(err.kind).toBe("provider_internal");
  if (err.kind === "provider_internal") expect(err.http_status).toBe(500);
});

test("network failure → network_unreachable", () => {
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-opus-4-8",
    message: "fetch failed",
  });
  expect(err).toEqual({
    kind: "network_unreachable",
    provider: "anthropic",
    message: "fetch failed",
  });
});

test("structural status hint wins over message parsing", () => {
  // No status in the text, but pi attached one via diagnostics.
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    message: "Service temporarily unavailable",
    status: 503,
  });
  expect(err.kind).toBe("provider_internal");
  if (err.kind === "provider_internal") expect(err.http_status).toBe(503);
});

test("unclassifiable error → unknown, preserving the raw text", () => {
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-opus-4-8",
    message: "prompt is too long: 250000 tokens > 200000 maximum",
  });
  expect(err).toEqual({
    kind: "unknown",
    provider: "anthropic",
    raw_excerpt: "prompt is too long: 250000 tokens > 200000 maximum",
  });
});

test("GitHub Copilot model_not_supported → model_unavailable + gpt-4.1 fallback (HOU-578)", () => {
  // The verbatim 400 a Copilot Free account answers a premium model with: the
  // model exists in the catalog but the plan doesn't serve it. Must NOT read as
  // auth (credential is fine) or rate/quota (nothing to wait out) — the fix is a
  // model switch, so it carries a known-good base model to offer.
  const message =
    '400 {"error":{"message":"The requested model is not supported.","code":"model_not_supported","param":"model","type":"invalid_request_error"}}';
  const err = classifyProviderError({
    provider: "github-copilot",
    model: "claude-sonnet-4.6",
    message,
  });
  expect(err).toEqual({
    kind: "model_unavailable",
    provider: "github-copilot",
    model: "claude-sonnet-4.6",
    reason: "unknown",
    suggested_fallback: "gpt-4.1",
    message,
  });
});

test("OpenAI model_not_found → model_unavailable, no fallback for a non-Copilot provider", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-9",
    message:
      "OpenAI API error (404): The model `gpt-9` does not exist or you do not have access to it. (model_not_found)",
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable") {
    expect(err.model).toBe("gpt-9");
    // We only know a safe fallback for Copilot; elsewhere offer none.
    expect(err.suggested_fallback).toBeNull();
  }
});

test("Copilot's own base model never self-suggests as the fallback", () => {
  // gpt-4.1 is the fallback target; if it were ever the failing model, offering
  // it back would be a no-op loop — suppress it.
  const err = classifyProviderError({
    provider: "github-copilot",
    model: "gpt-4.1",
    message: '400 {"error":{"code":"model_not_supported"}}',
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable")
    expect(err.suggested_fallback).toBeNull();
});

test("model_not_supported with no known model id falls through to unknown", () => {
  // model_unavailable must name what to switch away from; without a model id
  // there is nothing to render, so it degrades to the raw `unknown` card.
  const err = classifyProviderError({
    provider: "github-copilot",
    model: null,
    message: '400 {"error":{"code":"model_not_supported"}}',
  });
  expect(err.kind).toBe("unknown");
});

test("empty error text degrades to a stable unknown, never throws", () => {
  const err = classifyProviderError({
    provider: "anthropic",
    model: null,
    message: "",
  });
  expect(err.kind).toBe("unknown");
});

test("extractHttpStatus reads parenthesized, leading, and labelled forms", () => {
  expect(extractHttpStatus("OpenAI API error (429): boom")).toBe(429);
  expect(extractHttpStatus('401 {"type":"error"}')).toBe(401);
  expect(extractHttpStatus("request failed with status 503")).toBe(503);
  // A 3-digit number that is not a plausible HTTP status is ignored.
  expect(extractHttpStatus("used 700 tokens")).toBeNull();
  expect(extractHttpStatus("no status here")).toBeNull();
});

test("extractRetryAfterSeconds reads header value, minutes, and seconds", () => {
  expect(extractRetryAfterSeconds("retry-after: 12")).toBe(12);
  expect(extractRetryAfterSeconds("Try again in ~45 min.")).toBe(2700);
  expect(extractRetryAfterSeconds("resets in 30 seconds")).toBe(30);
  expect(extractRetryAfterSeconds("no window mentioned")).toBeNull();
  // Capped at 24h so a bogus huge value can't drive an absurd countdown.
  expect(extractRetryAfterSeconds("retry-after: 999999")).toBe(86_400);
});

test("extractRetryAfterSeconds reads the bare/fractional unit forms providers emit", () => {
  // The common OpenAI/Codex shapes: bare 's', fractional, and millis.
  expect(extractRetryAfterSeconds("Please try again in 2.5s.")).toBe(3);
  expect(extractRetryAfterSeconds("Please try again in 6.821s")).toBe(7);
  expect(extractRetryAfterSeconds("Please try again in 30s")).toBe(30);
  // Sub-second waits round up to a 1s countdown rather than vanishing.
  expect(extractRetryAfterSeconds("Please try again in 540ms")).toBe(1);
  expect(extractRetryAfterSeconds("Try again in 2 minutes")).toBe(120);
});
