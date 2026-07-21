import { beforeEach, expect, test, vi } from "vitest";

/**
 * verify-api-key.ts decision table: which provider outcomes prove a pasted key
 * authenticates (store it) vs reject it (never store). The live request is
 * mocked at the pi-ai `completeSimple` seam; classification runs the REAL
 * `classifyProviderError`, so these tests pin the taxonomy wiring too.
 */

const completeSimple = vi.fn();
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  completeSimple: (...args: unknown[]) => completeSimple(...args),
}));
vi.mock("../ai/providers", () => ({
  modelFor: () => "test-model",
  safeGetModel: () => ({ id: "test-model", provider: "openrouter" }),
}));

import { raisedMessage, verifyApiKey } from "./verify-api-key";

const reply = (over: Record<string, unknown>) => ({
  role: "assistant",
  content: [],
  usage: {},
  stopReason: "stop",
  ...over,
});

beforeEach(() => completeSimple.mockReset());

test("a successful completion verifies the key", async () => {
  completeSimple.mockResolvedValue(reply({}));
  await expect(verifyApiKey("openrouter", "sk-good")).resolves.toBeUndefined();
});

test("the candidate key rides the request options, never storage", async () => {
  completeSimple.mockResolvedValue(reply({}));
  await verifyApiKey("openrouter", "sk-candidate");
  const options = completeSimple.mock.calls[0][2] as {
    apiKey: string;
    maxTokens: number;
  };
  expect(options.apiKey).toBe("sk-candidate");
  expect(options.maxTokens).toBe(1);
});

test("a 401 rejection reads as an invalid key", async () => {
  completeSimple.mockResolvedValue(
    reply({
      stopReason: "error",
      errorMessage:
        '401 {"error":{"message":"invalid api key","code":"invalid_api_key"}}',
    }),
  );
  await expect(verifyApiKey("openrouter", "aa")).rejects.toThrow(
    /rejected this API key/,
  );
});

test("a rate limit proves the key authenticated — verified", async () => {
  completeSimple.mockResolvedValue(
    reply({
      stopReason: "error",
      errorMessage: "429 rate limit exceeded, try again in 20s",
    }),
  );
  await expect(verifyApiKey("openrouter", "sk-busy")).resolves.toBeUndefined();
});

test("insufficient balance proves the key authenticated — verified", async () => {
  completeSimple.mockResolvedValue(
    reply({
      stopReason: "error",
      errorMessage:
        '401 {"type":"CreditsError","message":"Insufficient balance"}',
    }),
  );
  await expect(verifyApiKey("opencode", "sk-broke")).resolves.toBeUndefined();
});

test("a network failure rejects without storing", async () => {
  completeSimple.mockResolvedValue(
    reply({ stopReason: "error", errorMessage: "fetch failed" }),
  );
  await expect(verifyApiKey("openrouter", "sk-any")).rejects.toThrow(
    /could not verify/,
  );
});

test("a gated model (together's 'Unable to access model') proves auth — verified", async () => {
  // together.ai validates the key BEFORE model entitlement, so this body means
  // the key works and only the probe model is out of reach on the plan.
  completeSimple.mockResolvedValue(
    reply({
      stopReason: "error",
      errorMessage:
        "Unable to access model MiniMaxAI/MiniMax-M2.7. Please visit https://api.together.ai/models to view the list of supported models.",
    }),
  );
  await expect(verifyApiKey("together", "sk-valid")).resolves.toBeUndefined();
});

test("an abort/timeout maps to a readable did-not-answer message", () => {
  // Tested on the pure mapper: rejecting the mocked completeSimple with an
  // abort-named error trips vitest's runner (it attributes the error object to
  // the test itself), while the integrated path is just try/catch + this fn.
  const abort = new Error("This operation was aborted");
  abort.name = "TimeoutError";
  expect(raisedMessage(abort, "together")).toBe(
    "together did not answer within 20s",
  );
  const plain = new Error("boom");
  expect(raisedMessage(plain, "together")).toBe("boom");
  expect(raisedMessage("string failure", "together")).toBe("string failure");
});
