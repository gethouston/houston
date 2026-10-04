import { afterEach, expect, test, vi } from "vitest";
import {
  PROVIDER_WARM_MAX_MS,
  ProviderWarmer,
  providerWarmUrl,
} from "./turn-provider-warm";

afterEach(() => {
  vi.useRealTimers();
});

test("a pi provider warms the origin its turn calls", () => {
  expect(new URL(providerWarmUrl("openai-codex") ?? "").origin).toBe(
    "https://chatgpt.com",
  );
  expect(new URL(providerWarmUrl("openrouter") ?? "").origin).toBe(
    "https://openrouter.ai",
  );
  expect(new URL(providerWarmUrl("opencode") ?? "").origin).toBe(
    "https://opencode.ai",
  );
});

test("providers this process cannot warm answer nothing", () => {
  // Claude dials from its own CLI process, Bedrock from the AWS SDK's pool,
  // and a custom endpoint's address lives in files only the turn reads.
  for (const provider of [
    "anthropic",
    "amazon-bedrock",
    "openai-compatible",
    "qwen",
    "xiaomi",
    "github-copilot",
    "",
    "no-such-provider",
  ]) {
    expect(providerWarmUrl(provider)).toBeUndefined();
  }
});

test("azure warms the resource endpoint the credential names, https only", () => {
  expect(
    providerWarmUrl(
      "azure-openai-responses",
      undefined,
      "https://acme.openai.azure.com/openai/v1",
    ),
  ).toBe("https://acme.openai.azure.com/openai/v1");
  expect(providerWarmUrl("azure-openai-responses")).toBeUndefined();
  expect(
    providerWarmUrl("azure-openai-responses", undefined, "http://acme.test"),
  ).toBeUndefined();
});

function recordingFetch() {
  const calls: { url: string; method?: string }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init) => {
    calls.push({ url: String(input), method: init?.method });
    return new Response(null, { status: 405 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test("a warm asks at once with OPTIONS, then every interval until its hold ends", async () => {
  vi.useFakeTimers();
  const { calls, fetchImpl } = recordingFetch();
  const lines: string[] = [];
  const warmer = new ProviderWarmer({
    fetch: fetchImpl,
    everyMs: 3_000,
    now: () => Date.now(),
    log: (line) => lines.push(line),
  });
  expect(warmer.start("https://chatgpt.com/backend-api", 10_000)).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(calls).toEqual([
    { url: "https://chatgpt.com/backend-api", method: "OPTIONS" },
  ]);
  await vi.advanceTimersByTimeAsync(30_000);
  // 0, 3, 6 and 9 s: a 12 s ask would fall past the 10 s hold.
  expect(calls).toHaveLength(4);
  expect(lines).toEqual([
    "[prewarm] provider warm ended: origin=https://chatgpt.com asked=4 failed=0",
  ]);
});

test("a turn stops the warm for good", async () => {
  vi.useFakeTimers();
  const { calls, fetchImpl } = recordingFetch();
  const warmer = new ProviderWarmer({ fetch: fetchImpl, everyMs: 3_000 });
  warmer.start("https://openrouter.ai/api/v1", 60_000);
  await vi.advanceTimersByTimeAsync(0);
  warmer.stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(calls).toHaveLength(1);
  expect(warmer.start("https://openrouter.ai/api/v1", 60_000)).toBe(false);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(calls).toHaveLength(1);
});

test("never two asks in flight, and a failed ask keeps the warm going", async () => {
  vi.useFakeTimers();
  let inFlight = 0;
  let most = 0;
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    inFlight += 1;
    most = Math.max(most, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    inFlight -= 1;
    if (calls === 1) throw new Error("socket hang up");
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
  const warmer = new ProviderWarmer({ fetch: fetchImpl, everyMs: 1_000 });
  warmer.start("https://opencode.ai/zen/v1", 30_000);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(most).toBe(1);
  expect(calls).toBeGreaterThan(1);
  warmer.stop();
});

test("a hold is capped however long the gateway asks", async () => {
  vi.useFakeTimers();
  const { calls, fetchImpl } = recordingFetch();
  const warmer = new ProviderWarmer({ fetch: fetchImpl, everyMs: 60_000 });
  warmer.start("https://api.openai.com/v1", 60 * 60_000);
  await vi.advanceTimersByTimeAsync(60 * 60_000);
  expect(calls.length).toBe(PROVIDER_WARM_MAX_MS / 60_000);
});

test("a later warm replaces the running one", async () => {
  vi.useFakeTimers();
  const { calls, fetchImpl } = recordingFetch();
  const warmer = new ProviderWarmer({ fetch: fetchImpl, everyMs: 3_000 });
  warmer.start("https://chatgpt.com/backend-api", 60_000);
  await vi.advanceTimersByTimeAsync(0);
  warmer.start("https://openrouter.ai/api/v1", 60_000);
  await vi.advanceTimersByTimeAsync(6_000);
  expect(
    calls.slice(1).every((c) => c.url.startsWith("https://openrouter.ai")),
  ).toBe(true);
  warmer.stop();
});
