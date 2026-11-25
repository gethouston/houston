import { expect, test } from "vitest";
import { classifyProviderError } from "./provider-error";

// Gateways that reject the MODEL id itself (retired, renamed or never served)
// with wording none of the older patterns read. Each must land on the
// switch-model card, never `unknown` (report-bug card + a Sentry error per turn).

test("MiniMax 400 'invalid params, unknown model' → model_unavailable", () => {
  const message =
    '400 {"type":"error","error":{"type":"bad_request_error","message":"invalid params, unknown model \'minimax-m2.7-highspeed\' (2013)","http_code":"400"}}';
  const err = classifyProviderError({
    provider: "minimax",
    model: "MiniMax-M2.7-highspeed",
    message,
  });
  expect(err).toEqual({
    kind: "model_unavailable",
    provider: "minimax",
    model: "MiniMax-M2.7-highspeed",
    reason: "unknown",
    suggested_fallback: null,
    message,
  });
});

test("OpenRouter 404 'No endpoints found for' a retired free variant → model_unavailable", () => {
  const message =
    '404 {"error":{"message":"No endpoints found for minimax/minimax-m3.1-flash:free.","code":404}}';
  const err = classifyProviderError({
    provider: "openrouter",
    model: "minimax/minimax-m3.1-flash:free",
    message,
  });
  expect(err.kind).toBe("model_unavailable");
});

test("OpenRouter 400 'is not a valid model ID' → model_unavailable", () => {
  const message =
    '400 {"error":{"message":"minimax/minimax-m3.1-flash:free is not a valid model ID","code":400}}';
  const err = classifyProviderError({
    provider: "openrouter",
    model: "minimax/minimax-m3.1-flash:free",
    message,
  });
  expect(err.kind).toBe("model_unavailable");
});

// Near-misses that must stay `unknown`: OpenRouter's capability and data-policy
// misses name no model, and a bad request field is not a dead model.
test.each([
  [
    "openrouter",
    '404 {"error":{"message":"No endpoints found that support tool use. To learn more about provider routing, visit: https://openrouter.ai/docs/provider-routing","code":404}}',
  ],
  [
    "openrouter",
    '404 {"error":{"message":"No endpoints found matching your data policy (Free model training). Configure: https://openrouter.ai/settings/privacy","code":404}}',
  ],
  ["openai-compatible", '400 unknown model parameter "foo"'],
])("%s near-miss %s stays unknown", (provider, message) => {
  const err = classifyProviderError({ provider, model: "some-model", message });
  expect(err.kind).toBe("unknown");
});

test("NVIDIA 410 for a model past its end of life → model_unavailable, deprecated, with a served fallback", () => {
  const message =
    '410 {"type":"about:blank","title":"Gone","status":410,"detail":"The model \'openai/gpt-oss-20b\' has reached its end of life on 2026-11-18T08:00:00Z and is no longer available."}';
  const err = classifyProviderError({
    provider: "nvidia",
    model: "openai/gpt-oss-20b",
    message,
  });
  expect(err).toEqual({
    kind: "model_unavailable",
    provider: "nvidia",
    model: "openai/gpt-oss-20b",
    reason: "deprecated",
    suggested_fallback: "minimaxai/minimax-m3.1-flash",
    message,
  });
});

test("a 410 that names a model is a retired model on any provider", () => {
  const err = classifyProviderError({
    provider: "openai-compatible",
    model: "llama-3-70b",
    message: '410 {"error":"model llama-3-70b was removed"}',
  });
  expect(err).toMatchObject({
    kind: "model_unavailable",
    reason: "deprecated",
  });
});

test("a 410 that names no model stays unknown", () => {
  const err = classifyProviderError({
    provider: "openai-compatible",
    model: "llama-3-70b",
    message: "410 Gone",
  });
  expect(err.kind).toBe("unknown");
});
