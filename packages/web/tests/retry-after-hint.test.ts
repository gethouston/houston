import { afterEach, expect, test, vi } from "vitest";
import { HoustonEngineError } from "../src/engine-adapter/client";
import { cpFetch } from "../src/engine-adapter/control-plane";

/**
 * The producer half of the `Retry-After` contract.
 *
 * `lib/assistant-availability.ts` has always scheduled discovery's retry off
 * `err.retryAfterMs` — the server's own estimate of when its pod will be ready
 * beats any client-side curve. This is where that field comes from: every
 * gateway/host failure thrown by `cpFetch` carries the response's parsed
 * `Retry-After`, or nothing at all when there is no trustworthy hint.
 *
 * 429 is used throughout because it is NOT one of the transient statuses
 * `cpFetch` retries, so each case throws on the first attempt.
 */

const CFG = { baseUrl: "https://host.example", token: "t" };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

/** Stub fetch to answer once with `status` and the given response headers. */
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
  // The cross-origin case too: a responder that does not list the header in
  // `Access-Control-Expose-Headers` reads exactly like one that never sent it,
  // and every scheduler falls back to its own backoff.
  stubFetch(429, {});
  expect((await thrownBy()).retryAfterMs).toBeUndefined();
});

test("an unparseable Retry-After is ignored, never guessed at", async () => {
  stubFetch(429, { "Retry-After": "in a bit" });
  expect((await thrownBy()).retryAfterMs).toBeUndefined();
});
