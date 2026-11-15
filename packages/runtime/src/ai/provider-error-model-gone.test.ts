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
