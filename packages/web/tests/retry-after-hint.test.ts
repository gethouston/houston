import { HoustonEngineError } from "@houston/engine-adapter/client";
import { cpFetch } from "@houston/engine-adapter/control-plane";
import { afterEach, expect, test, vi } from "vitest";

const CFG = { baseUrl: "https://host.example", token: "t" };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function stubFetch(status: number, headers: Record<string, string>): void {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: "slow down" }), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      }),
  ) as unknown as typeof fetch;
}

async function thrownBy(): Promise<HoustonEngineError> {
  try {
    await cpFetch(CFG, "/v1/assistant");
  } catch (err) {
    if (err instanceof HoustonEngineError) return err;
    throw err;
  }
  throw new Error("cpFetch resolved, expected it to throw");
}

test("a delay-seconds Retry-After lands on the thrown error, in ms", async () => {
  stubFetch(429, { "Retry-After": "7" });
  expect((await thrownBy()).retryAfterMs).toBe(7_000);
});

test("an HTTP-date Retry-After lands as the distance from now", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T07:28:00Z"));
  try {
    stubFetch(429, { "Retry-After": "Wed, 21 Oct 2026 07:28:45 GMT" });
    expect((await thrownBy()).retryAfterMs).toBe(45_000);
  } finally {
    vi.useRealTimers();
  }
});

test("no Retry-After header leaves the hint absent", async () => {
  stubFetch(429, {});
  expect((await thrownBy()).retryAfterMs).toBeUndefined();
});

test("an unparseable Retry-After is ignored, never guessed at", async () => {
  stubFetch(429, { "Retry-After": "in a bit" });
  expect((await thrownBy()).retryAfterMs).toBeUndefined();
});
