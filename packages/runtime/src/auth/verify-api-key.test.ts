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
  safeGetModel: (provider: string, modelId: string) =>
    provider === "google"
      ? {
          id: "gemini-3.5-flash",
          provider: "google",
          api: "google-generative-ai",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        }
      : { id: modelId ?? "test-model", provider },
}));

import {
  ApiKeyVerifyError,
  raisedMessage,
  verifyApiKey,
} from "./verify-api-key";

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

test("a 402 payment-required reply proves the key authenticated — verified", async () => {
  // The no-credits connect (2026-07 provider QA): a VALID key on an account
  // with an empty balance answers 402. That is past auth — a garbage key can't
  // owe money — so the key stores; the first chat turn then renders the
  // quota_exhausted card with the provider's own billing message.
  completeSimple.mockResolvedValue(
    reply({
      stopReason: "error",
      errorMessage:
        '402: {"error":{"message":"The account associated with this API key has reached its maximum allowed spending limit.","type":"invalid_request_error"}}',
    }),
  );
  await expect(verifyApiKey("together", "sk-broke")).resolves.toBeUndefined();
});

test("vercel's no-card block proves the key authenticated — verified", async () => {
  // Vercel AI Gateway rejects EVERY request until a card is on file, with no
  // status in pi's surfaced message — the body wording must carry the verdict.
  completeSimple.mockResolvedValue(
    reply({
      stopReason: "error",
      errorMessage:
        '{"error":{"message":"AI Gateway requires a valid credit card on file to service requests.","type":"customer_verification_required"}}',
    }),
  );
  await expect(
    verifyApiKey("vercel-ai-gateway", "vck-valid"),
  ).resolves.toBeUndefined();
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

test("moonshotai: a retired probe model's 404 still verifies the key (PRODUCT-1411)", async () => {
  // Live shape from HOUSTON-APP-54G: pi's catalog kept Moonshot's retired
  // kimi-k2 previews, so the probe answered `404 Not found the model` and 58
  // users read "couldn't reach Moonshot AI" for a perfectly good key. Moonshot
  // authenticates before it looks the model up (a bad key is a 401 even for a
  // garbage id), so this is a model verdict, not a key verdict — the key
  // stores; the retired model is a switch-model card later, not a lockout.
  completeSimple.mockResolvedValue(
    reply({
      stopReason: "error",
      errorMessage:
        '404: {"message":"Not found the model kimi-k2-0711-preview or Permission denied","type":"resource_not_found_error"}',
    }),
  );
  await expect(verifyApiKey("moonshotai", "sk-valid")).resolves.toBeUndefined();
});

const nvidiaGate = (model: string) =>
  reply({
    stopReason: "error",
    errorMessage: `404: {"status":404,"title":"Not Found","detail":"Function '23d4f03a-0000-4adb-a183-000000000000': Not found for account 'AAAA_synthetic'"} (${model})`,
  });

test("nvidia: a gated probe model retries a broadly-served fallback — key verified", async () => {
  // Live evidence (HOU-890): the SAME key answered `404 Not found for
  // account` on gemma and 200 on llama — NVIDIA gates models per account, so
  // one gated probe proves nothing about the key. The verifier must try the
  // fallback list before any verdict.
  completeSimple
    .mockResolvedValueOnce(nvidiaGate("test-model"))
    .mockResolvedValueOnce(reply({}));
  await expect(verifyApiKey("nvidia", "nvapi-valid")).resolves.toBeUndefined();
  expect(completeSimple).toHaveBeenCalledTimes(2);
  // The fallback probe ran against a model NVIDIA serves broadly.
  const fallbackModel = completeSimple.mock.calls[1][0] as { id: string };
  expect(fallbackModel.id).toBe("openai/gpt-oss-20b");
});

test("nvidia: every probe gated rejects as key_restricted", async () => {
  // The account-level "Public API Endpoints" wall: primary + all fallbacks
  // answer the gate. NOT provider_unavailable ("try again in a moment")
  // and NOT invalid_key ("paste it again") — neither remedy can work.
  completeSimple.mockResolvedValue(nvidiaGate("any"));
  await expect(verifyApiKey("nvidia", "nvapi-valid")).rejects.toMatchObject({
    name: "ApiKeyVerifyError",
    reason: "key_restricted",
    message: expect.stringMatching(/not being served/),
  });
  expect(completeSimple).toHaveBeenCalledTimes(3);
});

test("nvidia: a gated probe then a 403 on the fallback rejects as invalid_key", async () => {
  // A non-gate failure on a fallback probe hands the verdict to the normal
  // classification path — here NVIDIA's bad-key rejection.
  completeSimple
    .mockResolvedValueOnce(nvidiaGate("test-model"))
    .mockResolvedValueOnce(
      reply({
        stopReason: "error",
        errorMessage:
          '403: {"status":403,"title":"Forbidden","detail":"Authorization failed"}',
      }),
    );
  await expect(verifyApiKey("nvidia", "nvapi-bad")).rejects.toMatchObject({
    reason: "invalid_key",
  });
});

test("nvidia: 403 'Authorization failed' still rejects as invalid_key", async () => {
  // A genuinely bad or revoked key — the HOU-1077 classification must keep
  // owning this shape; only the 404/410 gate reads key_restricted.
  completeSimple.mockResolvedValue(
    reply({
      stopReason: "error",
      errorMessage:
        '403: {"status":403,"title":"Forbidden","detail":"Authorization failed"}',
    }),
  );
  await expect(verifyApiKey("nvidia", "nvapi-bad")).rejects.toMatchObject({
    reason: "invalid_key",
  });
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
