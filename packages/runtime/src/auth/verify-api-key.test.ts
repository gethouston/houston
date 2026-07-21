import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * verify-api-key.ts decision table: which provider outcomes prove a pasted key
 * authenticates (store it) vs reject it (never store), and the typed `reason`
 * each rejection carries to the connect dialog. The generic path is mocked at
 * the pi-ai `completeSimple` seam; classification runs the REAL
 * `classifyProviderError`, so these tests pin the taxonomy wiring too. Google
 * rides the models-LIST probe instead (a completion probe let Google's
 * "high demand" 503 fail a perfectly good key), mocked at global fetch.
 */

const completeSimple = vi.fn();
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  completeSimple: (...args: unknown[]) => completeSimple(...args),
}));
vi.mock("../ai/providers", () => ({
  modelFor: () => "test-model",
  safeGetModel: (provider: string) =>
    provider === "google"
      ? {
          id: "gemini-3.5-flash",
          provider: "google",
          api: "google-generative-ai",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        }
      : { id: "test-model", provider: "openrouter" },
}));

import { ApiKeyVerifyError, verifyApiKey } from "./verify-api-key";

const reply = (over: Record<string, unknown>) => ({
  role: "assistant",
  content: [],
  usage: {},
  stopReason: "stop",
  ...over,
});

const fetchMock = vi.fn();

beforeEach(() => {
  completeSimple.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

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
  await expect(verifyApiKey("openrouter", "aa")).rejects.toMatchObject({
    name: "ApiKeyVerifyError",
    reason: "invalid_key",
    message: expect.stringMatching(/rejected this API key/),
  });
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

test("a network failure rejects without storing, as provider_unavailable", async () => {
  completeSimple.mockResolvedValue(
    reply({ stopReason: "error", errorMessage: "fetch failed" }),
  );
  await expect(verifyApiKey("openrouter", "sk-any")).rejects.toMatchObject({
    reason: "provider_unavailable",
    message: expect.stringMatching(/could not verify/),
  });
});

// --- Google: verified against the models-list endpoint, never a completion ---

const googleRes = (status: number, message?: string) => ({
  ok: status >= 200 && status < 300,
  status,
  text: () =>
    Promise.resolve(
      message ? JSON.stringify({ error: { code: status, message } }) : "{}",
    ),
});

test("google: a 200 from the models list verifies — no completion is sent", async () => {
  fetchMock.mockResolvedValue(googleRes(200));
  await expect(verifyApiKey("google", "AIza-good")).resolves.toBeUndefined();
  expect(completeSimple).not.toHaveBeenCalled();
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
  );
  // The key rides a header (never the query string, which lands in logs).
  expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
    "AIza-good",
  );
});

test("google: 400 API_KEY_INVALID rejects as invalid_key", async () => {
  fetchMock.mockResolvedValue(
    googleRes(400, "API key not valid. Please pass a valid API key."),
  );
  await expect(verifyApiKey("google", "AIza-bad")).rejects.toMatchObject({
    reason: "invalid_key",
    message: expect.stringMatching(/rejected this API key.*API key not valid/),
  });
});

test("google: 403 API-disabled-on-project rejects as key_restricted with Google's remedy", async () => {
  const detail =
    "Gemini API has not been used in project 444578952321 before or it is disabled.";
  fetchMock.mockResolvedValue(googleRes(403, detail));
  const err = await verifyApiKey("google", "AIza-noapi").catch((e) => e);
  expect(err).toBeInstanceOf(ApiKeyVerifyError);
  expect(err.reason).toBe("key_restricted");
  expect(err.message).toContain(detail);
});

test("google: 403 referrer-blocked rejects as key_restricted", async () => {
  fetchMock.mockResolvedValue(
    googleRes(403, "Requests from referer <empty> are blocked."),
  );
  await expect(verifyApiKey("google", "AIza-ref")).rejects.toMatchObject({
    reason: "key_restricted",
  });
});

test("google: 429 proves the key authenticated — verified", async () => {
  fetchMock.mockResolvedValue(googleRes(429, "Resource has been exhausted"));
  await expect(verifyApiKey("google", "AIza-busy")).resolves.toBeUndefined();
});

test("google: a 503 leaves no verdict — provider_unavailable, key not saved", async () => {
  fetchMock.mockResolvedValue(
    googleRes(503, "This model is currently experiencing high demand."),
  );
  await expect(verifyApiKey("google", "AIza-maybe")).rejects.toMatchObject({
    reason: "provider_unavailable",
    message: expect.stringMatching(/could not verify.*high demand/),
  });
});

test("google: a network failure rejects as provider_unavailable", async () => {
  fetchMock.mockRejectedValue(new Error("fetch failed"));
  await expect(verifyApiKey("google", "AIza-any")).rejects.toMatchObject({
    reason: "provider_unavailable",
  });
});

test("google: a non-JSON error body still surfaces, with the raw text", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 502,
    text: () => Promise.resolve("Bad Gateway"),
  });
  await expect(verifyApiKey("google", "AIza-any")).rejects.toMatchObject({
    reason: "provider_unavailable",
    message: expect.stringMatching(/Bad Gateway/),
  });
});
