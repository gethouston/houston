import { beforeEach, expect, test, vi } from "vitest";
import { classifyText, mapSdkError } from "./errors";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

test("authentication_failed → unauthenticated, cause read from the message text", () => {
  expect(
    mapSdkError("authentication_failed", {
      message: "401 OAuth token has expired",
      model: "claude-opus-4-5",
    }),
  ).toEqual({
    kind: "unauthenticated",
    provider: "anthropic",
    cause: "token_expired",
    message: "401 OAuth token has expired",
  });
});

test("authentication_failed → invalid_api_key / token_revoked / unknown causes", () => {
  expect(
    mapSdkError("authentication_failed", {
      message: "invalid API key provided",
      model: null,
    }).kind,
  ).toBe("unauthenticated");
  const revoked = mapSdkError("authentication_failed", {
    message: "Your session has ended. Please log in again.",
    model: null,
  });
  expect(revoked).toMatchObject({ cause: "token_revoked" });
  const unknown = mapSdkError("authentication_failed", {
    message: "not authorized",
    model: null,
  });
  expect(unknown).toMatchObject({ cause: "unknown" });
});

test("oauth_org_not_allowed → unauthenticated", () => {
  expect(
    mapSdkError("oauth_org_not_allowed", { message: "org policy", model: null })
      .kind,
  ).toBe("unauthenticated");
});

test("billing_error → quota_exhausted", () => {
  expect(
    mapSdkError("billing_error", { message: "billing issue", model: "m" }),
  ).toEqual({
    kind: "quota_exhausted",
    provider: "anthropic",
    model: "m",
    scope: "unknown",
    resets_at: null,
    message: "billing issue",
  });
});

test("rate_limit → rate_limited, retry from the rate_limit_event when present", () => {
  expect(
    mapSdkError("rate_limit", {
      message: "rate limited",
      model: "m",
      retryAfterSeconds: 42,
    }),
  ).toEqual({
    kind: "rate_limited",
    provider: "anthropic",
    model: "m",
    retry_after_seconds: 42,
    message: "rate limited",
  });
});

test("rate_limit → retry parsed from message text when no event seen", () => {
  expect(
    mapSdkError("rate_limit", {
      message: "Please try again in 30 seconds",
      model: null,
    }),
  ).toMatchObject({ kind: "rate_limited", retry_after_seconds: 30 });
});

test("overloaded / server_error → provider_internal with the http status", () => {
  expect(
    mapSdkError("overloaded", {
      message: "overloaded",
      model: null,
      status: 529,
    }),
  ).toEqual({
    kind: "provider_internal",
    provider: "anthropic",
    http_status: 529,
    message: "overloaded",
  });
  expect(
    mapSdkError("server_error", { message: "boom", model: null }),
  ).toMatchObject({ kind: "provider_internal", http_status: null });
});

test("model_not_found → model_unavailable when a model is named", () => {
  expect(
    mapSdkError("model_not_found", {
      message: "no such model",
      model: "claude-x",
    }),
  ).toEqual({
    kind: "model_unavailable",
    provider: "anthropic",
    model: "claude-x",
    reason: "unknown",
    suggested_fallback: null,
    message: "no such model",
  });
});

test("model_not_found with no model falls through to the text classifier", () => {
  // No model to name → cannot render the switch-model card; classify the text.
  expect(
    mapSdkError("model_not_found", {
      message: "does not exist or you do not have access",
      model: null,
    }).kind,
  ).not.toBe("model_unavailable");
});

test("invalid_request / max_output_tokens / unknown fall through to the classifier", () => {
  expect(
    mapSdkError("invalid_request", {
      message: "429 too many requests",
      model: null,
    }),
  ).toMatchObject({ kind: "rate_limited" });
  expect(
    mapSdkError("unknown", { message: "something weird", model: null }),
  ).toMatchObject({ kind: "unknown", raw_excerpt: "something weird" });
});

test("classifyText passes provider + status through the shared classifier", () => {
  expect(classifyText("Internal Server Error", "m", 500)).toEqual({
    kind: "provider_internal",
    provider: "anthropic",
    http_status: 500,
    message: "Internal Server Error",
  });
});

test("the verbatim provider text is logged before it is reduced to a card", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  mapSdkError("rate_limit", { message: "429 slow down", model: "m" });
  expect(spy).toHaveBeenCalledWith(expect.stringContaining("429 slow down"));
});
