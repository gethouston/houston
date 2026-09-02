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

test.each([
  "401 Your session has ended. Please log in again.",
  "401 Unauthorized. Please login again to continue.",
  "401 Unauthorized: session terminated",
])("loose terminal phrasing still reads token_revoked: %s", (message) => {
  // The CARD copy stays generous: any 401 that reads terminal should say "your
  // access was revoked, sign in again". What these phrasings must NOT do is
  // trigger the workspace-wide revoked-token report — that gate keeps its own
  // strict marker list in `auth/report-revoked.ts` (tested there), so a
  // provider wording a transient blip this way can no longer delete a live
  // credential for every runtime in the workspace.
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    message,
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("token_revoked");
});

test("Codex deactivated workspace → unauthenticated / token_revoked (PRODUCT-1547)", () => {
  // ChatGPT rejects the WORKSPACE behind an otherwise-valid OAuth token with
  // this bare structured body — no status, no prose — so nothing else in the
  // classifier can match it and it degraded to `unknown` (report-bug card +
  // a Sentry error per turn). Terminal for this account: the reconnect card's
  // "access revoked, sign in again" is the honest copy, and the strict
  // revocation-report gate (auth/revocation-markers.ts) deliberately does NOT
  // list it — the token still works, so nothing may delete it.
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.5",
    message: '{"detail":{"code":"deactivated_workspace"}}',
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("token_revoked");
});

test("pi prompt-time 'No API key found' → unauthenticated / no_credentials (HOU-718)", () => {
  // pi RAISES this (formatNoApiKeyFoundMessage) when the user logged out of a
  // provider that stayed selected — it never arrives as an errored
  // AssistantMessage, so exec-turn/turn-session classify the throw. Without
  // this the chat showed the raw text (node_modules doc paths included)
  // instead of the reconnect card.
  const err = classifyProviderError({
    provider: "openai-codex",
    model: null,
    message:
      "No API key found for openai-codex.\n\nUse /login to log into a provider via OAuth or API key. See:\n  /app/node_modules/@earendil-works/pi-coding-agent/docs/providers.md\n  /app/node_modules/@earendil-works/pi-coding-agent/docs/models.md",
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("no_credentials");
});

test("runtime 'No local model configured' → unauthenticated / no_credentials", () => {
  // buildActiveCustomModel's guard, thrown from execTurn's resolveModel on a
  // CACHED conversation whose custom endpoint was disconnected mid-chat. The
  // typed classification is what routes the reconnect card (local-model
  // dialog) + the undelivered-prompt auto-resume; `unknown` rendered only the
  // generic error card.
  const err = classifyProviderError({
    provider: "openai-compatible",
    model: "Jan-v3.5-4B-Q4_K_XL",
    message:
      "No local model configured. Set a base URL and model for the OpenAI-compatible provider.",
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("no_credentials");
});

test("runtime 'No provider connected' → unauthenticated / no_credentials", () => {
  // resolveModel's connect guard — same cached-conversation path as above.
  const err = classifyProviderError({
    provider: "",
    model: null,
    message: "No provider connected. Connect an AI provider first.",
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("no_credentials");
});

test("pi 0.82 'Provider is not configured' → unauthenticated / no_credentials (HOU-956)", () => {
  // pi 0.82's ModelRuntime applyAuth message when its credential store
  // resolves nothing for the model's provider. pi catches its own raise, so
  // this arrives as an errored AssistantMessage on a turn pinned to a
  // disconnected provider (pins are never auth-gated). Without the pattern it
  // classified `unknown` — the generic error card instead of the reconnect
  // card the pin design counts on.
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.5-flash",
    message: "Provider is not configured: google",
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("no_credentials");
});

test("pi prompt-time OAuth guard ('Authentication failed … Run /login') → unauthenticated / token_expired", () => {
  // pi's OAuth flavor of the same prompt-time guard.
  const err = classifyProviderError({
    provider: "openai-codex",
    model: null,
    message:
      "Authentication failed for \"openai-codex\". Credentials may have expired or network is unavailable. Run '/login openai-codex' to re-authenticate.",
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("token_expired");
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

// HOU-1154: the plan's tokens are SPENT — the "no more tokens" quota card, not
// the rate-limit card the same message used to render ("Alcanzaste un límite
// de velocidad" on an account that had simply run out of plan).
test("Codex usage limit → quota_exhausted, not rate_limited", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    message:
      "You have hit your ChatGPT usage limit (pro plan). Try again in ~45 min.",
  });
  expect(err.kind).toBe("quota_exhausted");
  if (err.kind === "quota_exhausted") {
    expect(err.model).toBe("gpt-5.1-codex");
    expect(err.resets_at).toBeNull();
  }
});

// HOU-1154: OpenAI's out-of-credit failure rides HTTP 429 exactly like a burst
// limit — the `insufficient_quota` body is what separates "top up your account"
// from "wait a moment", so it must win over the 429 short-circuit.
test("OpenAI insufficient_quota under 429 → quota_exhausted, not rate_limited", () => {
  const err = classifyProviderError({
    provider: "openai",
    model: "gpt-5.2",
    message:
      'OpenAI API error (429): {"error":{"message":"You exceeded your current quota, please check your plan and billing details.","type":"insufficient_quota","param":null,"code":"insufficient_quota"}}',
  });
  expect(err.kind).toBe("quota_exhausted");
  if (err.kind === "quota_exhausted") expect(err.model).toBe("gpt-5.2");
});

// A genuine burst limit stays a rate limit: "quota" wording scoped to a
// per-minute window is throttling, not exhaustion (the Gemini free-tier shape).
test("per-minute quota body stays rate_limited", () => {
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-2.5-pro",
    message:
      "got status: 429 Too Many Requests. Quota exceeded for quota metric 'Generate Content API requests per minute'. Please retry in 21s.",
  });
  expect(err.kind).toBe("rate_limited");
  if (err.kind === "rate_limited") expect(err.retry_after_seconds).toBe(21);
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
    message: "something odd happened while streaming the response",
  });
  expect(err).toEqual({
    kind: "unknown",
    provider: "anthropic",
    raw_excerpt: "something odd happened while streaming the response",
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

test("Xiaomi 'Not supported model' 400 → model_unavailable + mimo-v2.5-pro fallback (PRODUCT-1517)", () => {
  // Verbatim from a Token Plan gateway answering mimo-v2.5-pro-ultraspeed — a
  // model only the general endpoint serves. Xiaomi checks the key before the
  // model (a bad key answers 401 for any model id), so the credential is fine
  // and only the pick is out of reach. The reversed word order ("Not supported
  // model", not "model not supported") matched no pattern and degraded to
  // `unknown` — the report-bug card instead of switch-model.
  const message =
    '400: {"code":"400","message":"Not supported model mimo-v2.5-pro-ultraspeed"}';
  const err = classifyProviderError({
    provider: "xiaomi",
    model: "mimo-v2.5-pro-ultraspeed",
    message,
  });
  expect(err).toEqual({
    kind: "model_unavailable",
    provider: "xiaomi",
    model: "mimo-v2.5-pro-ultraspeed",
    reason: "unknown",
    suggested_fallback: "mimo-v2.5-pro",
    message,
  });
});

test("Xiaomi fallback model itself unsupported → no self-referential fallback", () => {
  const err = classifyProviderError({
    provider: "xiaomi",
    model: "mimo-v2.5-pro",
    message:
      '400: {"code":"400","message":"Not supported model mimo-v2.5-pro"}',
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable")
    expect(err.suggested_fallback).toBeNull();
});

test("Copilot 'not available for integrator' 400 → model_unavailable + gpt-4.1 fallback (HOU-977)", () => {
  // Copilot's NEWER wording for the same plan-doesn't-serve-this-model failure:
  // no `model_not_supported` code, just prose naming the integrator and the
  // plan's model list. Fell through to `unknown` (generic card + auto bug
  // report) until the pattern landed.
  const message =
    '400: {"message":"The requested model is not available for integrator \\"vscode-chat\\". Available models: [gpt-4.1 claude-fable-5 claude-opus-4.7 claude-opus-4.8-fast claude-opus-4.8 claude-opus-5 claude-sonnet-4.6 claude-sonnet-5]"}';
  const err = classifyProviderError({
    provider: "github-copilot",
    model: "gpt-5.6-sol",
    message,
  });
  expect(err).toEqual({
    kind: "model_unavailable",
    provider: "github-copilot",
    model: "gpt-5.6-sol",
    reason: "unknown",
    suggested_fallback: "gpt-4.1",
    message,
  });
});

test("together.ai's gated-model body → model_unavailable, never unknown", () => {
  // The verbatim rejection together.ai answers a non-serverless model with. The
  // key authenticated fine — classifying this as `unknown` made the api-key
  // verify reject a VALID key (the 2026-07 provider QA "Failed to connect").
  const err = classifyProviderError({
    provider: "together",
    model: "MiniMaxAI/MiniMax-M2.7",
    message:
      "Unable to access model MiniMaxAI/MiniMax-M2.7. Please visit https://api.together.ai/models to view the list of supported models.",
  });
  expect(err.kind).toBe("model_unavailable");
});

test("Azure missing-deployment 404 → model_unavailable, never unknown (PRODUCT-1477)", () => {
  // Azure answers 401 for a bad key BEFORE any deployment lookup, so this
  // 404 proves the credential — classifying it unknown made verify read
  // "couldn't reach Azure OpenAI" for a valid key whose deployment name
  // simply didn't match the probe model.
  const err = classifyProviderError({
    provider: "azure-openai-responses",
    model: "gpt-5.5",
    message:
      "Azure OpenAI API error (404 DeploymentNotFound): The API deployment for this resource does not exist. If you created the deployment within the last 5 minutes, please wait a moment and try again.",
  });
  expect(err.kind).toBe("model_unavailable");
  // The reason drives the card body (PRODUCT-1600): "pick another model" is a
  // dead end on Azure — every not-deployed pick fails identically — so the
  // card must say "deploy it under the model's exact name" instead. No
  // fallback either: we cannot know which deployments the resource has.
  if (err.kind !== "model_unavailable") throw new Error("unreachable");
  expect(err.reason).toBe("not_deployed");
  expect(err.suggested_fallback).toBeNull();
});

test("Bedrock bare-foundation-id on-demand rejection → model_unavailable, never unknown (PRODUCT-1477)", () => {
  // The verbatim ValidationException Bedrock answers a bare Claude 4.x id with
  // (Sentry, 2026-08-21) — note AWS's curly apostrophe in "isn\u2019t", which
  // keeps every "is not supported" pattern from matching. The key
  // authenticated fine; classifying this as `unknown` made the api-key verify
  // read "couldn't reach Amazon Bedrock" for a valid key.
  const err = classifyProviderError({
    provider: "amazon-bedrock",
    model: "anthropic.claude-sonnet-4-6",
    message:
      "Validation error: Invocation of model ID anthropic.claude-sonnet-4-6 with on-demand throughput isn\u2019t supported. Retry your request with the ID or ARN of an inference profile that contains this model.",
  });
  expect(err.kind).toBe("model_unavailable");
  // The switch-model card names the id that works on a plain Bedrock key.
  if (err.kind === "model_unavailable")
    expect(err.suggested_fallback).toBe("global.anthropic.claude-sonnet-4-6");
});

test("Bedrock off-region profile 'provided model identifier is invalid' → model_unavailable + global fallback (PRODUCT-1641)", () => {
  // Verbatim Bedrock 400 for `au.anthropic.claude-opus-5` — an
  // inference profile that exists only in the AU endpoint. Classified
  // `unknown` before: the report-bug card and a Sentry error per attempt for
  // a valid key whose only problem was the pick.
  const message = "Validation error: The provided model identifier is invalid.";
  const err = classifyProviderError({
    provider: "amazon-bedrock",
    model: "au.anthropic.claude-opus-5",
    message,
    status: 400,
  });
  expect(err).toEqual({
    kind: "model_unavailable",
    provider: "amazon-bedrock",
    model: "au.anthropic.claude-opus-5",
    reason: "unknown",
    suggested_fallback: "global.anthropic.claude-sonnet-4-6",
    message,
  });
});

test("Bedrock's own fallback never self-suggests", () => {
  const err = classifyProviderError({
    provider: "amazon-bedrock",
    model: "global.anthropic.claude-sonnet-4-6",
    message: "Validation error: The provided model identifier is invalid.",
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable")
    expect(err.suggested_fallback).toBeNull();
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
  // The OpenAI SDK's body-less form behind a compaction prefix (PRODUCT-1636).
  expect(
    extractHttpStatus("Summarization failed: 410 status code (no body)"),
  ).toBe(410);
  // The Claude Agent SDK's canonical failure text (PRODUCT-1307).
  expect(
    extractHttpStatus(
      "Failed to authenticate. API Error: 401 OAuth access token has been revoked.",
    ),
  ).toBe(401);
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

// opencode.ai OVERLOADS HTTP 401 for non-auth failures. These are its verbatim
// error bodies (billing id redacted). The classifier must NOT turn them into a
// reconnect card the valid key can't satisfy — that was the bug behind "Sign in
// to OpenCode Zen again" for an account simply out of credit, or one that picked
// a model opencode.ai doesn't serve.
test("opencode CreditsError under 401 → quota_exhausted, not a reconnect", () => {
  const message =
    '{"type":"error","error":{"type":"CreditsError","message":"Insufficient balance. Manage your billing here: https://opencode.ai/workspace/wrk_test/billing"}}';
  const err = classifyProviderError({
    provider: "opencode",
    model: "claude-fable-5",
    message,
    status: 401,
  });
  expect(err.kind).toBe("quota_exhausted");
  if (err.kind === "quota_exhausted") {
    // No reset window — the account must top up / upgrade, not wait it out.
    expect(err.resets_at).toBeNull();
    expect(err.message).toContain("Insufficient balance");
  }
});

test("opencode CreditsError classifies off the body even with no parsed status", () => {
  const err = classifyProviderError({
    provider: "opencode-go",
    model: "kimi-k2.6",
    message:
      '{"error":{"type":"CreditsError","message":"Insufficient balance. Manage your billing here: https://opencode.ai/workspace/wrk_test/billing"}}',
  });
  expect(err.kind).toBe("quota_exhausted");
});

test("MiniMax 'insufficient balance (1008)' under 500 → quota_exhausted, not provider_internal", () => {
  // MiniMax's Anthropic-compatible endpoint ships its out-of-quota error as an
  // HTTP 500 api_error (the HOU-1160 "usage ran out" report). The
  // insufficient-balance body check runs BEFORE the 5xx branch — this test pins
  // that load-bearing order: a 500-status quota body must show the "pay or
  // switch" card (a token-plan user on the wrong SKU can act on that), never a
  // retryable-looking server error.
  const err = classifyProviderError({
    provider: "minimax",
    model: "MiniMax-M3",
    message:
      '{"type":"error","error":{"type":"api_error","message":"insufficient balance (1008)"}}',
    status: 500,
  });
  expect(err.kind).toBe("quota_exhausted");
  if (err.kind === "quota_exhausted") {
    expect(err.resets_at).toBeNull();
    expect(err.message).toContain("insufficient balance");
  }
});

test("opencode ModelError 'is not supported' under 401 → model_unavailable, not a reconnect", () => {
  const err = classifyProviderError({
    provider: "opencode",
    model: "minimax-m3-free",
    message:
      '{"type":"error","error":{"type":"ModelError","message":"Model minimax-m3-free is not supported"}}',
    status: 401,
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable")
    expect(err.model).toBe("minimax-m3-free");
});

// opencode.ai's gateway reports an upstream stream break as "Streaming response
// failed" — no status, no JSON envelope in the worst case (HOU-929's verbatim
// report). It is a transient server-side failure (retry helps), so it must read
// as provider_internal (Retry + status page), never the report-bug `unknown`.
test("opencode 'Streaming response failed' → provider_internal, not unknown (HOU-929)", () => {
  const err = classifyProviderError({
    provider: "opencode",
    model: "qwen3-coder",
    message: "Streaming response failed",
  });
  expect(err).toEqual({
    kind: "provider_internal",
    provider: "opencode",
    http_status: null,
    message: "Streaming response failed",
  });
});

test("opencode stream failure classifies inside a JSON error envelope too", () => {
  const err = classifyProviderError({
    provider: "opencode-go",
    model: null,
    message:
      '{"type":"error","error":{"type":"APIError","message":"Streaming response failed"}}',
  });
  expect(err.kind).toBe("provider_internal");
});

// OpenRouter ends the stream with `finish_reason: "error"` when its UPSTREAM
// provider dies mid-generation; pi-ai flattens that to the bare string
// `Provider finish_reason: error` — no status, no body (HOU-930's verbatim
// report). Server-side and transient, so it must read as provider_internal
// (Retry card), never the report-bug `unknown`.
test("openrouter 'Provider finish_reason: error' → provider_internal, not unknown (HOU-930)", () => {
  const err = classifyProviderError({
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4.5",
    message: "Provider finish_reason: error",
  });
  expect(err).toEqual({
    kind: "provider_internal",
    provider: "openrouter",
    http_status: null,
    message: "Provider finish_reason: error",
  });
});

test("'Provider finish_reason: network_error' → provider_internal too", () => {
  // pi-ai's dedicated mapping for gateways that name the upstream break
  // "network_error" — the provider's network, not the user's, so it must NOT
  // read as network_unreachable ("check your connection" would be wrong).
  const err = classifyProviderError({
    provider: "openrouter",
    model: null,
    message: "Provider finish_reason: network_error",
  });
  expect(err.kind).toBe("provider_internal");
});

// Gemini ends a turn with finishReason MALFORMED_FUNCTION_CALL /
// MALFORMED_RESPONSE when the MODEL's own generation broke (an unparseable
// tool call, a garbled response); pi-ai flattens both to `Provider stopped
// with: <REASON>` — no status, no body (PRODUCT-1601's verbatim reports).
// Server-side and transient — Google's guidance is retry — so they must read
// as provider_internal (Retry card), never the report-bug `unknown` firing a
// Sentry error per turn.
test("google 'Provider stopped with: MALFORMED_RESPONSE' → provider_internal, not unknown (PRODUCT-1601)", () => {
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.5-flash-lite",
    message: "Provider stopped with: MALFORMED_RESPONSE",
  });
  expect(err).toEqual({
    kind: "provider_internal",
    provider: "google",
    http_status: null,
    message: "Provider stopped with: MALFORMED_RESPONSE",
  });
});

test("google 'Provider stopped with: MALFORMED_FUNCTION_CALL' → provider_internal too", () => {
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.6-flash",
    message: "Provider stopped with: MALFORMED_FUNCTION_CALL",
  });
  expect(err.kind).toBe("provider_internal");
});

test("older pi's 'Unhandled stop reason: MALFORMED_RESPONSE' phrasing classifies the same", () => {
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.5-flash",
    message: "Unhandled stop reason: MALFORMED_RESPONSE",
  });
  expect(err.kind).toBe("provider_internal");
});

// Gemini's policy stops ride the same `Provider stopped with:` prefix but are
// refusals, not outages — retry does not help and the Retry card would lie.
// They must keep falling through to `unknown` (the report-bug card), like
// OpenAI's `content_filter`.
test("google 'Provider stopped with: SAFETY' stays unknown — a refusal, not an outage", () => {
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.6-flash",
    message: "Provider stopped with: SAFETY",
  });
  expect(err.kind).toBe("unknown");
});

// Codex's WebSocket transport dying mid-turn arrives as the bare string
// `WebSocket closed <code>` — no status, no body (HOU-848's verbatim report;
// 584 Sentry events across 137 users read as `unknown`). HOU-1156 first
// classified it network_unreachable, but every production event comes from a
// cloud engine pod — "check your internet" points at the wrong network. A
// dropped socket is a transient server-side stream break — retry helps — so
// it reads as provider_internal (Retry card), never the report-bug `unknown`
// and never the check-your-connection card.
test("codex 'WebSocket closed 1006' → provider_internal, not unknown (HOU-848)", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.5",
    message: "WebSocket closed 1006",
  });
  expect(err).toEqual({
    kind: "provider_internal",
    provider: "openai-codex",
    http_status: null,
    message: "WebSocket closed 1006",
  });
});

test("other observed close codes classify the same way", () => {
  // 1000 (server closed the socket cleanly mid-turn) and 1012 (service
  // restart) both appear in the same Sentry bucket — same transient verdict.
  for (const code of [1000, 1012]) {
    const err = classifyProviderError({
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      message: `WebSocket closed ${code}`,
    });
    expect(err.kind).toBe("provider_internal");
  }
});

// Envoy's canonical no-upstream-response body: a proxy on the pod↔provider
// path answers for an upstream whose connection died before response headers —
// flattened by the Codex path to the bare body, no status (HOUSTON-APP-4Y9's
// verbatim report; 670 Sentry events across 151 users read as `unknown`).
// Transient, and Envoy already retried ("retried and the latest reset
// reason…"); like the WebSocket break above, every production event comes from
// a cloud engine pod, so provider_internal (Retry card) — never the report-bug
// `unknown`, never check-your-connection.
test("envoy 'upstream connect error … connection termination' → provider_internal, not unknown (HOUSTON-APP-4Y9)", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.6-terra",
    message:
      "upstream connect error or disconnect/reset before headers. reset reason: connection termination",
  });
  expect(err).toEqual({
    kind: "provider_internal",
    provider: "openai-codex",
    http_status: null,
    message:
      "upstream connect error or disconnect/reset before headers. reset reason: connection termination",
  });
});

test("envoy's retried variant ('… retried and the latest reset reason: connection timeout') classifies the same way", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.5",
    message:
      "upstream connect error or disconnect/reset before headers. retried and the latest reset reason: connection timeout",
  });
  expect(err.kind).toBe("provider_internal");
});

test("envoy 'Upstream idle timeout exceeded' → provider_internal, not unknown", () => {
  // Same proxy, different failure: the upstream stopped responding mid-request
  // and Envoy gave up. Seen via openrouter in the same Sentry bucket.
  const err = classifyProviderError({
    provider: "openrouter",
    model: "openrouter/free",
    message: "Upstream idle timeout exceeded",
  });
  expect(err).toEqual({
    kind: "provider_internal",
    provider: "openrouter",
    http_status: null,
    message: "Upstream idle timeout exceeded",
  });
});

test("envoy body arriving WITH its usual 503 keeps the status on the card", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.6-terra",
    message:
      "upstream connect error or disconnect/reset before headers. reset reason: connection termination",
    status: 503,
  });
  expect(err.kind).toBe("provider_internal");
  if (err.kind === "provider_internal") expect(err.http_status).toBe(503);
});

// OpenAI's generic server-side failure — "An error occurred while processing
// your request. You can retry your request, or …" — arrives via the Codex path
// as "Codex error: <body>" with no HTTP status anywhere in the string, so the
// 5xx short-circuit never fires (HOU-898's verbatim report). The body itself
// says retry helps: provider_internal (Retry card), never the report-bug
// `unknown`.
test("Codex 'An error occurred while processing your request' → provider_internal, not unknown (HOU-898)", () => {
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.1-codex",
    message:
      "Codex error: An error occurred while processing your request. You can retry your request, or contact us through our help center at help.openai.com if the error persists. Please include the request ID 21cbc7f3-020b-4f21-bd24-63a4bfbffe10 in your message.",
  });
  expect(err.kind).toBe("provider_internal");
  if (err.kind === "provider_internal") {
    expect(err.provider).toBe("openai-codex");
    expect(err.http_status).toBeNull();
  }
});

test("'Provider finish_reason: content_filter' stays unknown — a refusal, not an outage", () => {
  const err = classifyProviderError({
    provider: "openrouter",
    model: "openai/gpt-5.5",
    message: "Provider finish_reason: content_filter",
  });
  expect(err.kind).toBe("unknown");
});

// undici's fetch abort: a bare `TypeError: terminated` fires when the HTTP
// socket to the gateway closes while the streamed body is still being read —
// pi-ai flattens it to the single word "terminated", no status, no body
// (HOU-902's verbatim report, provider opencode-go). The stream had already
// started, so it's the same mid-response break as HOU-929 detected one layer
// lower: provider_internal (Retry card), never the report-bug `unknown`.
test("undici 'terminated' mid-stream socket close → provider_internal, not unknown (HOU-902)", () => {
  const err = classifyProviderError({
    provider: "opencode-go",
    model: null,
    message: "terminated",
  });
  expect(err).toEqual({
    kind: "provider_internal",
    provider: "opencode-go",
    http_status: null,
    message: "terminated",
  });
});

test("'TypeError: terminated' wrapper classifies the same way", () => {
  const err = classifyProviderError({
    provider: "opencode-go",
    model: "qwen3-coder",
    message: "TypeError: terminated",
  });
  expect(err.kind).toBe("provider_internal");
});

test("a body merely CONTAINING 'terminated' does not read as an outage", () => {
  // Whole-message match only: an account-termination notice is not transient.
  const err = classifyProviderError({
    provider: "opencode-go",
    model: null,
    message: "Your account has been terminated for abuse",
  });
  expect(err.kind).toBe("unknown");
});

test("session-kill bodies ending in 'terminated' still win the reconnect card", () => {
  // Auth precedence is untouched: `(app_session_terminated)` style bodies are
  // claimed by the auth branch before the server-error branch ever runs.
  const err = classifyProviderError({
    provider: "openai-codex",
    model: null,
    message: "Your session was terminated",
  });
  expect(err.kind).toBe("unauthenticated");
});

test("a genuine opencode 401 invalid key still reads as unauthenticated", () => {
  // The fix must not blunt real auth failures: an invalid key under 401 stays a
  // reconnect prompt.
  const err = classifyProviderError({
    provider: "opencode",
    model: "claude-sonnet-4-6",
    message:
      '{"type":"error","error":{"type":"AuthError","message":"Invalid API key"}}',
    status: 401,
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("invalid_api_key");
});

// ---------------------------------------------------------------------------
// No-credit / payment-required bodies (2026-07 provider QA). A VALID key on an
// account with no credit answers with a billing error; if that fell to
// `unknown`, verify-api-key read it as "no verdict" and refused to store a
// perfectly good key. HTTP 402 alone decides — Payment Required is
// definitionally billing — and the wordings below cover the shapes that ship
// under other statuses. Together/Fireworks/Cerebras bodies are reconstructed
// from their docs (402 semantics verified; exact prose may drift), the Vercel /
// Anthropic / NVIDIA bodies are verbatim from user reports.

test("a 402 classifies as quota_exhausted on status alone, whatever the body", () => {
  // The body deliberately matches NO balance wording — the status must decide.
  const err = classifyProviderError({
    provider: "fireworks",
    model: "accounts/fireworks/models/deepseek-v4-flash",
    message:
      '402: {"error":{"message":"Usage is paused for this account. Visit your billing dashboard to resume.","code":"BILLING_PAUSED"}}',
  });
  expect(err.kind).toBe("quota_exhausted");
  if (err.kind === "quota_exhausted") expect(err.resets_at).toBeNull();
});

test("together 402 spend cap → quota_exhausted, never a reconnect", () => {
  const err = classifyProviderError({
    provider: "together",
    model: "MiniMaxAI/MiniMax-M2.7",
    message:
      '402: {"error":{"message":"The account associated with this API key has reached its maximum allowed spending limit. Update your limit at https://api.together.ai/settings/billing","type":"invalid_request_error","param":null,"code":null}}',
  });
  expect(err.kind).toBe("quota_exhausted");
});

test("cerebras 402 missing payment method → quota_exhausted", () => {
  const err = classifyProviderError({
    provider: "cerebras",
    model: "gemma-4-31b",
    message:
      '402: {"message":"Please add a payment method to unlock your free credits.","type":"payment_required_error","code":"payment_required"}',
  });
  expect(err.kind).toBe("quota_exhausted");
});

test("vercel AI Gateway no-card block classifies off the body with no status", () => {
  // Verbatim gateway body (community.vercel.com/t/37168): the account is valid,
  // it just has no card on file — a billing action, not a reconnect.
  const err = classifyProviderError({
    provider: "vercel-ai-gateway",
    model: "alibaba/qwen-3-14b",
    message:
      '{"error":{"message":"AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F~%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.","type":"customer_verification_required"}}',
  });
  expect(err.kind).toBe("quota_exhausted");
});

test("anthropic api-key credit floor (HTTP 400) → quota_exhausted", () => {
  // Anthropic ships its no-credit failure under 400 invalid_request_error, so
  // the 402 short-circuit misses it; the body wording must carry it.
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    message:
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
  });
  expect(err.kind).toBe("quota_exhausted");
});

test("NVIDIA NIM expired cloud credits → quota_exhausted", () => {
  const err = classifyProviderError({
    provider: "nvidia",
    model: "moonshotai/kimi-k2.5",
    message:
      "402: Cloud credits expired - Please contact NVIDIA representatives",
  });
  expect(err.kind).toBe("quota_exhausted");
});

test("NVIDIA NIM 403 'Authorization failed' → unauthenticated / invalid_api_key", () => {
  // Verbatim integrate.api.nvidia.com rejection of a bad or revoked key
  // (HOU-1077): a 403 whose body names neither "unauthorized" nor
  // "authentication", so it used to fall through to `unknown` — the generic
  // error card mid-chat, and "could not verify" instead of "didn't accept
  // this key" at connect time.
  const err = classifyProviderError({
    provider: "nvidia",
    model: "meta/llama-3.1-70b-instruct",
    message:
      '403: {"status":403,"title":"Forbidden","detail":"Authorization failed"}',
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("invalid_api_key");
});

test("NVIDIA body-less 410 (per-account model gate) → model_unavailable with the broad fallback (HOU-890)", () => {
  // Verbatim OpenAI-SDK flattening of integrate.api.nvidia.com's empty 410:
  // the key authenticated (a bad key answers 403 "Authorization failed"), but
  // THIS model isn't served for the account, while /v1/models still lists it.
  // The switch-model card with a one-click broadly-served target is the
  // honest surface — re-keying can never fix a gated model.
  const err = classifyProviderError({
    provider: "nvidia",
    model: "google/gemma-3-12b-it",
    message: "410 status code (no body)",
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable")
    expect(err.suggested_fallback).toBe("openai/gpt-oss-120b");
});

test("NVIDIA body-less 404 (same gate, NVIDIA's newer status) → model_unavailable (HOU-890)", () => {
  const err = classifyProviderError({
    provider: "nvidia",
    model: "google/gemma-3-12b-it",
    message: "404 status code (no body)",
  });
  expect(err.kind).toBe("model_unavailable");
});

test("NVIDIA 404 'Not found for account' body → model_unavailable (HOU-890)", () => {
  // Verbatim shape from a live partially-gated account (uuids/ids synthetic):
  // gemma/kimi/glm answered this while llama/gpt-oss served fine on the SAME
  // key — proof the gate is per-model, not per-key.
  const err = classifyProviderError({
    provider: "nvidia",
    model: "moonshotai/kimi-k2.6",
    message:
      '404: {"status":404,"title":"Not Found","detail":"Function \'23d4f03a-0000-4adb-a183-000000000000\': Not found for account \'AAAA_0TTwo6g9X0i9D1GDz8lMxxCukw55Lpk8aPhW0I\'"}',
  });
  expect(err.kind).toBe("model_unavailable");
});

test("NVIDIA gate on the broad fallback itself offers no fallback", () => {
  const err = classifyProviderError({
    provider: "nvidia",
    model: "openai/gpt-oss-120b",
    message: "404 status code (no body)",
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable")
    expect(err.suggested_fallback).toBeNull();
});

test("NVIDIA 404 WITH an unrelated error body stays out of the gate branch", () => {
  // A detail sentence that names neither a function nor the account means a
  // different failure — must keep falling through to `unknown`.
  const err = classifyProviderError({
    provider: "nvidia",
    model: "meta/llama-3.1-70b-instruct",
    message:
      '404: {"status":404,"title":"Not Found","detail":"Model meta/llama-3.1-70b-instruct does not exist"}',
  });
  expect(err.kind).toBe("unknown");
});

test("a body-less 410 from another provider stays unknown", () => {
  const err = classifyProviderError({
    provider: "openrouter",
    model: "some/model",
    message: "410 status code (no body)",
  });
  expect(err.kind).toBe("unknown");
});

test("NVIDIA body-less 410 wrapped by pi's compaction → model_unavailable, same as the chat turn (PRODUCT-1636)", () => {
  // Verbatim HOUSTON-APP-57B: the retired llama row 410s on the chat turn
  // (classified above) AND on pi's manual `compact()` summarization request,
  // which prefixes the identical text — the leading-status parse never saw
  // past the prefix, so 222 of the bucket's 230 events read `unknown`.
  for (const message of [
    "Summarization failed: 410 status code (no body)",
    "Turn prefix summarization failed: 410 status code (no body)",
    "Summarization failed: 404 status code (no body)",
  ]) {
    const err = classifyProviderError({
      provider: "nvidia",
      model: "meta/llama-3.1-70b-instruct",
      message,
    });
    expect(err.kind).toBe("model_unavailable");
    if (err.kind === "model_unavailable")
      expect(err.suggested_fallback).toBe("openai/gpt-oss-120b");
  }
});

test("NVIDIA gpt-oss 'Unknown role: final' (server-side Harmony parse of a malformed generation) → provider_internal (PRODUCT-1636)", () => {
  // Verbatim: NVIDIA NIM's gpt-oss-120b rejected its OWN output's message
  // header mid-stream; the OpenAI SDK raised the `{"error":…}` chunk with no
  // status and pi flattened it to the bare text. Transient — retry helps.
  const err = classifyProviderError({
    provider: "nvidia",
    model: "openai/gpt-oss-120b",
    message: "Unknown role: final",
  });
  expect(err).toMatchObject({
    kind: "provider_internal",
    provider: "nvidia",
    http_status: null,
  });
});

test("NVIDIA 'ResourceExhausted: … request limit reached' (gRPC throttling, no HTTP status) → rate_limited (PRODUCT-1636)", () => {
  const err = classifyProviderError({
    provider: "nvidia",
    model: "openai/gpt-oss-120b",
    message:
      "ResourceExhausted: Worker local total request limit reached (37/16)",
  });
  expect(err.kind).toBe("rate_limited");
  if (err.kind === "rate_limited") expect(err.retry_after_seconds).toBeNull();
});

test("Alibaba DashScope free-tier exhaustion → quota_exhausted, never a rate-limit countdown", () => {
  // Verbatim dashscope-us body for a VALID key whose free quota ran out
  // (HOU-1077): the fix is adding payment info, so the "pay or switch" card
  // is the honest one. Without the AllocationQuota pattern the bare word
  // "quota" tripped the rate-limit branch (a wait-it-out countdown that can
  // never end).
  const err = classifyProviderError({
    provider: "qwen",
    model: "qwen3.7-max",
    message:
      '{"error":{"message":"The free quota has been exhausted. To continue accessing the model on a paid basis, please complete your payment information （or disable the \\"use free tier only\\" mode in the management console if already completed).","type":"AllocationQuota.FreeTierOnly","param":null,"code":"AllocationQuota.FreeTierOnly"}}',
  });
  expect(err.kind).toBe("quota_exhausted");
});

test("Qwen Token Plan 401 'Invalid API-key provided' → unauthenticated / invalid_api_key", () => {
  // Verbatim token-plan.ap-southeast-1.maas.aliyuncs.com body (HOU-1077). The
  // endpoint only accepts a DEDICATED Token Plan key — a regular Model Studio
  // key lands here. "API-key" is hyphenated; the cause must still read
  // invalid_api_key so the card says the key itself was refused.
  const err = classifyProviderError({
    provider: "qwen-token-plan",
    model: "qwen3.7-max",
    message:
      '401: {"message":"Invalid API-key provided. For details, see: https://www.alibabacloud.com/help/en/model-studio/error-code#apikey-error","id":"76019e5d-2f21-45dd-88c3-40d23773d800","type":"invalid_request_error","code":"invalid_api_key"}',
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("invalid_api_key");
});

test("Google 403 PERMISSION_DENIED 'project has been denied access' → unauthenticated / invalid_api_key (HOU-920)", () => {
  // Verbatim generativelanguage.googleapis.com body when the API key's GCP
  // project is blocked by Google. The whole credential is unusable — every
  // request fails — so the remedy is pasting a different key (google is an
  // apiKey provider: the card opens the re-paste dialog, HOU-1077). The
  // embedded `"code":403` extractor (HOU-1156) recovers the status, but a 403
  // is deliberately auth only when the BODY names an auth failure — without
  // the PERMISSION_DENIED patterns it fell through to `unknown`.
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.5-flash",
    message:
      '{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 403,\\n    \\"message\\": \\"Your project has been denied access. Please contact support.\\",\\n    \\"status\\": \\"PERMISSION_DENIED\\"\\n  }\\n}\\n","code":403,"status":"Forbidden"}}',
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("invalid_api_key");
});

test("Google PERMISSION_DENIED status label alone → unauthenticated (HOU-920)", () => {
  // Google's other 403s ride the same canonical gRPC label (key restrictions,
  // SERVICE_DISABLED, suspended consumer) — all mean this key/project cannot
  // call the API, all reconnect. Anthropic's resource-level "permission_error"
  // must NOT trip this (its own test above asserts it stays out of the
  // reconnect card).
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.5-flash",
    message:
      '{"error":{"code":403,"message":"Method doesn\'t allow unregistered callers (callers without established identity). Please use API Key or other form of API consumer identity to call this API.","status":"PERMISSION_DENIED"}}',
  });
  expect(err.kind).toBe("unauthenticated");
});

// ---------------------------------------------------------------------------
// Context overflow — the conversation no longer fits the model's window.
// The Jan fixture is the VERBATIM llama.cpp rejection from the production
// incident that used to fall through to `unknown` (a Jan-v3.5-4B custom
// endpoint with n_ctx=8192 behind a Houston tunnel).

test("llama.cpp/Jan exceed_context_size_error → context_overflow with both token counts", () => {
  const err = classifyProviderError({
    provider: "openai-compatible",
    model: "Jan-v3.5-4B-Q4_K_XL",
    message:
      '400: {"code":400,"message":"request (15246 tokens) exceeds the available context size (8192 tokens), try increasing it","type":"exceed_context_size_error","n_prompt_tokens":15246,"n_ctx":8192}',
  });
  expect(err).toEqual({
    kind: "context_overflow",
    provider: "openai-compatible",
    model: "Jan-v3.5-4B-Q4_K_XL",
    context_window_tokens: 8192,
    prompt_tokens: 15246,
    message:
      '400: {"code":400,"message":"request (15246 tokens) exceeds the available context size (8192 tokens), try increasing it","type":"exceed_context_size_error","n_prompt_tokens":15246,"n_ctx":8192}',
  });
});

test("OpenAI context_length_exceeded → context_overflow with the window parsed", () => {
  const err = classifyProviderError({
    provider: "openai",
    model: "gpt-4o",
    message:
      "OpenAI API error (400): This model's maximum context length is 128000 tokens. However, your messages resulted in 131085 tokens. Please reduce the length of the messages. (context_length_exceeded)",
  });
  expect(err.kind).toBe("context_overflow");
  if (err.kind === "context_overflow") {
    expect(err.context_window_tokens).toBe(128000);
  }
});

test("Anthropic 'prompt is too long' → context_overflow, never rate_limited despite the 400 body", () => {
  const err = classifyProviderError({
    provider: "anthropic",
    model: "claude-opus-4-8",
    message:
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 213462 tokens > 200000 maximum"}}',
  });
  expect(err.kind).toBe("context_overflow");
  if (err.kind === "context_overflow") {
    expect(err.prompt_tokens).toBe(213462);
    expect(err.context_window_tokens).toBe(200000);
  }
});

test("OpenAI per-string 10MiB cap ('string too long') → context_overflow with null token counts", () => {
  // Verbatim from PRODUCT-1394 (HOUSTON-APP-56R): pi's unbounded compaction
  // serialized a 31MB conversation into one content string; OpenAI caps any
  // single string at 10,485,760 chars. The message carries char counts, not
  // token counts, so both extractors must stay null (the card omits numbers).
  const err = classifyProviderError({
    provider: "openai-codex",
    model: "gpt-5.5",
    message:
      "Summarization failed: Invalid 'input[0].content[0].text': string too long. Expected a string with maximum length 10485760, but got a string with length 31056249 instead.",
  });
  expect(err.kind).toBe("context_overflow");
  if (err.kind === "context_overflow") {
    expect(err.context_window_tokens).toBeNull();
    expect(err.prompt_tokens).toBeNull();
  }
});

test("overflow text without numbers still classifies, with null token counts", () => {
  const err = classifyProviderError({
    provider: "amazon-bedrock",
    model: "anthropic.claude-3",
    message: "400: Input is too long for requested model.",
  });
  expect(err.kind).toBe("context_overflow");
  if (err.kind === "context_overflow") {
    expect(err.context_window_tokens).toBeNull();
    expect(err.prompt_tokens).toBeNull();
  }
});

// HOU-1156: verbatim shapes of the `unknown` families the 90-day Sentry audit
// surfaced — each was rendering the content-free "Something unexpected
// happened" card. Fixtures mirror the real payloads (identifiers synthetic).
// (The Codex `WebSocket closed <code>` family from that audit lives with the
// mid-stream break tests above — reclassified network_unreachable →
// provider_internal by HOU-848.)

test("openrouter 'Stream ended without finish_reason' → provider_internal (HOU-1156)", () => {
  const err = classifyProviderError({
    provider: "openrouter",
    model: "openrouter/free",
    message: "Stream ended without finish_reason",
  });
  expect(err.kind).toBe("provider_internal");
});

test("Google gRPC UNAVAILABLE overload → provider_internal with the embedded 503 (HOU-1156)", () => {
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.5-flash",
    message:
      'got status: UNAVAILABLE. {"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}',
  });
  expect(err.kind).toBe("provider_internal");
  if (err.kind === "provider_internal") expect(err.http_status).toBe(503);
});

test("Google double-encoded 429 body → rate_limited via the embedded code (HOU-1156)", () => {
  // The status lives ONLY inside the escaped inner JSON: `\"code\": 429`.
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3-flash-preview",
    message:
      '{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 429,\\n    \\"message\\": \\"Resource has been exhausted (e.g. check quota).\\",\\n    \\"status\\": \\"RESOURCE_EXHAUSTED\\"\\n  }\\n}"}}',
  });
  expect(err.kind).toBe("rate_limited");
});

test("Google billing dunning denial → quota_exhausted, not unknown (HOU-1156)", () => {
  // 403 whose body names a billing-delinquency ("dunning") decision: paying,
  // not reconnecting, is the fix.
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.5-flash",
    message:
      '{"error":{"message":"{\\n  \\"error\\": {\\n    \\"code\\": 403,\\n    \\"message\\": \\"Lightning dunning decision is deny for project: projects/000000000000\\",\\n    \\"status\\": \\"PERMISSION_DENIED\\"\\n  }\\n}"}}',
  });
  expect(err.kind).toBe("quota_exhausted");
});

test("opencode RegionError → model_unavailable / region_restricted (HOU-1156)", () => {
  // The credential is fine and nothing resets: only the MODEL needs a region
  // opt-in, so the switch-model card is the honest surface.
  const err = classifyProviderError({
    provider: "opencode-go",
    model: "deepseek-v4-flash",
    message:
      '403: {"type":"RegionError","message":"The latest version of this model is only available hosted in China and requires explicit opt in: https://opencode.ai/workspace"}',
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable")
    expect(err.reason).toBe("region_restricted");
});

test("Moonshot 404 'Not found the model' → model_unavailable (PRODUCT-1411)", () => {
  // Verbatim api.moonshot.ai body for a retired id (the whole kimi-k2 preview
  // series was discontinued 2026-05-25 while pi's catalog still lists it).
  // Moonshot checks the key BEFORE the model (a bad key answers 401 even for
  // a garbage model id), so this proves the credential: switch-model card,
  // never the report-bug `unknown` card — and at connect time a verified key.
  const err = classifyProviderError({
    provider: "moonshotai",
    model: "kimi-k2-0711-preview",
    message:
      '404: {"message":"Not found the model kimi-k2-0711-preview or Permission denied","type":"resource_not_found_error"}',
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable") {
    expect(err.reason).toBe("unknown");
    // One-click switch to the broadest-served Kimi model (listed by
    // /v1/models even on an un-funded account).
    expect(err.suggested_fallback).toBe("kimi-k2.6");
  }
});

test("Moonshot gate on the broad fallback itself offers no fallback", () => {
  const err = classifyProviderError({
    provider: "moonshotai",
    model: "kimi-k2.6",
    message:
      '404: {"message":"Not found the model kimi-k2.6 or Permission denied","type":"resource_not_found_error"}',
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable")
    expect(err.suggested_fallback).toBeNull();
});

test("embedded code extraction stays out of 1xx-3xx (HOU-1156)", () => {
  // A stray non-HTTP application code must never veto the auth branch.
  expect(extractHttpStatus('{"code": 200, "message": "ok-ish"}')).toBeNull();
  expect(extractHttpStatus('{"error":{"code":503}}')).toBe(503);
  expect(extractHttpStatus('{"code": "invalid_api_key"}')).toBeNull();
});

test("Anthropic consumer-terms 400 stays unknown with the actionable excerpt (HOU-1156)", () => {
  // No taxonomy kind fits (nothing to retry, reconnect, or pay for) — the
  // provider's own sentence IS the remedy, and the unknown card now shows it.
  const message =
    "API Error: 400 We've updated our Consumer Terms and Privacy Policy. You'll need to accept them in claude.ai with the email in /status to continue.";
  const err = classifyProviderError({
    provider: "anthropic",
    model: null,
    message,
  });
  expect(err.kind).toBe("unknown");
  if (err.kind === "unknown") expect(err.raw_excerpt).toBe(message);
});

test("pi 0.84 setModel 'No API key for <provider>/<model>' → unauthenticated / no_credentials (PRODUCT-1530)", () => {
  // AgentSession.setModel's checkAuth throw dropped the "found": on a cloud
  // pod whose credential store served no key for a configured custom endpoint
  // this fired as `unknown` — a Sentry error per turn — instead of reconnect.
  const err = classifyProviderError({
    provider: "openai-compatible",
    model: "gemma4:latest",
    message: "No API key for openai-compatible/gemma4:latest",
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("no_credentials");
});

test("pi 0.84 api-layer 'No API key for provider: <id>' → unauthenticated / no_credentials", () => {
  const err = classifyProviderError({
    provider: "openai-compatible",
    model: null,
    message: "No API key for provider: openai-compatible",
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("no_credentials");
});

test("local-override mismatch → model_unavailable with the served model as the fallback (PRODUCT-1530)", () => {
  // The runtime's own guard (`localOverrideError`): a conversation pinned to a
  // model the reconfigured endpoint no longer serves fails EVERY turn with
  // this message. The endpoint names its one served model — the definitive
  // one-click switch target.
  const message =
    'The local endpoint serves "qwen2.5-coder:14b", not "gemma4:latest". Pick the local model (or switch the active provider) before this turn.';
  const err = classifyProviderError({
    provider: "openai-compatible",
    model: "gemma4:latest",
    message,
  });
  expect(err).toEqual({
    kind: "model_unavailable",
    provider: "openai-compatible",
    model: "gemma4:latest",
    reason: "unknown",
    suggested_fallback: "qwen2.5-coder:14b",
    message,
  });
});

test("custom endpoint 404 (HTML body) → model_unavailable, never unknown (PRODUCT-1530)", () => {
  // A base URL that doesn't host the OpenAI API answers the completions POST
  // with its web server's 404 page — raw HTML that read as `unknown` and
  // fired a Sentry error per turn. The credential is fine; the endpoint
  // config / model pick is the fix, so switch-model is the honest card.
  const err = classifyProviderError({
    provider: "openai-compatible",
    model: "gemma4:e4b-it-qat",
    message:
      "404 <!DOCTYPE html>\n<html>\n<head>\n<title>Not Found</title>\n</head>\n<body>404 Not Found</body>\n</html>",
  });
  expect(err.kind).toBe("model_unavailable");
  if (err.kind === "model_unavailable") {
    expect(err.reason).toBe("unknown");
    expect(err.suggested_fallback).toBeNull();
  }
});

test("a 404 on any OTHER provider still falls through to unknown", () => {
  // The custom-endpoint 404 verdict is provider-scoped: other providers' 404s
  // keep their own explicit patterns (NVIDIA's account gate, Azure's
  // DeploymentNotFound, Moonshot's retired models).
  const err = classifyProviderError({
    provider: "openai",
    model: "gpt-5.5",
    message:
      "404 <!DOCTYPE html><html><head><title>Not Found</title></head></html>",
  });
  expect(err.kind).toBe("unknown");
});

test("Azure missing base URL → unauthenticated / no_credentials (PRODUCT-1532)", () => {
  // pi's azure client throws this before any HTTP when the per-resource
  // endpoint never landed on THIS runtime — the key alone can't be aimed.
  const err = classifyProviderError({
    provider: "azure-openai-responses",
    model: "gpt-5.4-mini",
    message:
      "Azure OpenAI base URL is required. Set AZURE_OPENAI_BASE_URL or AZURE_OPENAI_RESOURCE_NAME, or pass azureBaseUrl, azureResourceName, or model.baseUrl.",
  });
  expect(err.kind).toBe("unauthenticated");
  if (err.kind === "unauthenticated") expect(err.cause).toBe("no_credentials");
  // Any other provider mentioning a base URL keeps its own classification.
  const other = classifyProviderError({
    provider: "openrouter",
    model: "some-model",
    message: "base URL is required",
  });
  expect(other.kind).toBe("unknown");
});
