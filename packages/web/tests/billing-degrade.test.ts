import { afterEach, expect, test, vi } from "vitest";
import { HoustonEngineError } from "../src/engine-adapter/client";
import { getBilling } from "../src/engine-adapter/control-plane";

/**
 * `getBilling` on the HOSTED path (C8 §Billing) is the client every cloud build
 * actually runs — the engine-client shim's `getBilling` only matters to the
 * legacy client. So the not-entitled degrade has to land HERE: a gateway that
 * predates billing (404), a caller it refuses billing detail (403), and — the
 * HOU-904 regression — a billing-OFF deployment (503 `billing not configured`,
 * every prod gateway with no `GW_STRIPE_*`) all resolve to `null` so the billing
 * UI renders nothing, instead of throwing and firing the red "Houston, we have a
 * problem" bug toast on every team entry. Any other status is a real failure and
 * must throw. Mirrors `catalog-404.test.ts`.
 */

const CFG = { baseUrl: "https://host.example", token: "t" };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stub fetch to answer every call at `status`/`body`, recording the urls hit. */
function stubFetch(status: number, body: unknown): string[] {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    calls.push(String(input));
    return json(status, body);
  }) as unknown as typeof fetch;
  return calls;
}

const BILLING = { plan: "team", status: "trialing", seats: 3 };

test("getBilling() hits /v1/org/billing and returns the parsed summary on 200", async () => {
  const calls = stubFetch(200, BILLING);
  await expect(getBilling(CFG)).resolves.toEqual(BILLING);
  expect(calls).toEqual(["https://host.example/v1/org/billing"]);
});

test("getBilling() degrades a 404 (host predates billing) to null", async () => {
  stubFetch(404, { error: "no route" });
  await expect(getBilling(CFG)).resolves.toBeNull();
});

test("getBilling() degrades a 403 (personal space / plain member) to null", async () => {
  stubFetch(403, { error: "personal_space" });
  await expect(getBilling(CFG)).resolves.toBeNull();
});

test("getBilling() degrades a 503 (billing not configured) to null — HOU-904", async () => {
  // 503 is transient for reads, so cpFetch blind-retries twice before the error
  // surfaces to the degrade; fake timers fast-forward those waits.
  vi.useFakeTimers();
  const calls = stubFetch(503, { error: "billing not configured" });
  const p = getBilling(CFG);
  await vi.runAllTimersAsync();
  await expect(p).resolves.toBeNull();
  expect(calls.length).toBe(3); // initial + two transient retries, then degrade
});

test("getBilling() does NOT degrade a non-404/403/503 error (throws)", async () => {
  stubFetch(500, { error: "boom" });
  await expect(getBilling(CFG)).rejects.toThrow(HoustonEngineError);
});
