import { expect, test } from "vitest";
import { classifyProviderError } from "./provider-error";

/**
 * Status-less failures pi retries. One that still reaches the classifier
 * means pi's retries ran out on a server-side outage: the wait-and-retry card,
 * never the report-bug `unknown`.
 */
test.each([
  ["deepseek", '{"error":{"code":"server_busy","message":"Server busy"}}'],
  ["deepseek", "The servers are currently busy, please try again later."],
  ["mistral", "Provider stopped with: error (server error)"],
  ["mistral", "Mistral response headers timed out after 60000ms"],
  ["openrouter", "Provider returned error"],
  ["openrouter", "The upstream provider returned an error"],
  ["openai", "Unable to forward upstream stream"],
  ["zai", "The service is temporarily unavailable"],
  ["openai-compatible", "<html><title>503 Service Temporarily Unavailable"],
  ["openai", "upstream_request_failed"],
  ["openai", "upstream_stream_read_error"],
  ["openai-compatible", "The stream was interrupted"],
  ["openrouter", "HTTP/2 stream failed"],
  [
    "openai-compatible",
    "stream disconnected before completion: stream closed before response.completed",
  ],
  [
    "google-vertex",
    "request to https://oauth2.googleapis.com/token failed, reason: ",
  ],
])("%s %s → provider_internal", (provider, message) => {
  expect(classifyProviderError({ provider, model: "m", message }).kind).toBe(
    "provider_internal",
  );
});

test.each([
  [
    "openrouter",
    '404: {"message":"Provider returned error","code":404,"metadata":{"raw":"{\\"error\\":{\\"code\\":\\"model_not_found\\",\\"message\\":\\"The model does not exist or you do not have access to it.\\"}}"}}',
    "model_unavailable",
  ],
  [
    "openai-compatible",
    "404 The upstream provider returned an error",
    "model_unavailable",
  ],
  [
    "openai-compatible",
    '404 {"error":{"code":"model_not_found","message":"The service is temporarily unavailable for this model"}}',
    "model_unavailable",
  ],
  [
    "openai-compatible",
    '404 {"error":{"code":"model_not_found","message":"upstream request failed: no such model"}}',
    "model_unavailable",
  ],
])("an upstream %s 4xx keeps its own verdict: %s", (provider, message, kind) => {
  expect(classifyProviderError({ provider, model: "m", message }).kind).toBe(
    kind,
  );
});

test.each([
  '400: {"message":"Provider returned error","code":400,"metadata":{"raw":"invalid_request_error: tool_use.input: Input should be a valid dictionary"}}',
  '403: {"message":"Provider returned error","code":403,"metadata":{"raw":"Your request was flagged by content moderation"}}',
])("an upstream 4xx refusal is never read as an outage: %s", (message) => {
  expect(
    classifyProviderError({ provider: "openrouter", model: "m", message }).kind,
  ).not.toBe("provider_internal");
});

test("a Gemini policy stop sharing the prefix is not read as an outage", () => {
  const err = classifyProviderError({
    provider: "google",
    model: "gemini-3.8-flash",
    message: "Provider stopped with: SAFETY",
  });
  expect(err.kind).not.toBe("provider_internal");
});
