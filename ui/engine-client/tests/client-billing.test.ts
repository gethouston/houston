import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient, HoustonEngineError } from "../src/client.ts";

/**
 * C8 billing client surface: `getBilling` / `createCheckout` / `createPortal`.
 * A capturing `fetchImpl` records the outgoing `{method, url, body}` so the exact
 * wire request is asserted, and returns a canned body (at a chosen status) so the
 * parse/degrade side is covered too. Mirrors `client-spaces.test.ts`.
 */

interface Captured {
  method: string;
  url: string;
  body: unknown;
}

function makeClient(
  responseBody: unknown = {},
  status = 200,
): { client: HoustonClient; calls: Captured[] } {
  const calls: Captured[] = [];
  const client = new HoustonClient({
    baseUrl: "http://127.0.0.1:9999",
    token: "tok",
    // Tiny retry budget so a non-degrading error path resolves promptly.
    retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, deadlineMs: 50 },
    fetchImpl: async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      });
      return new Response(JSON.stringify(responseBody), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

const BILLING = {
  plan: "team",
  status: "trialing",
  trialEndsAt: "2026-07-22T00:00:00.000Z",
  seats: 3,
};

describe("HoustonClient C8 billing — getBilling", () => {
  it("GETs /org/billing and returns the parsed BillingSummary", async () => {
    const { client, calls } = makeClient(BILLING);
    const got = await client.getBilling();
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/billing");
    deepStrictEqual(got, BILLING);
  });

  it("degrades a 404 to null (host predates billing)", async () => {
    const { client } = makeClient({}, 404);
    strictEqual(await client.getBilling(), null);
  });

  it("degrades a 403 to null (personal space / plain member — not entitled)", async () => {
    const { client } = makeClient({ error: "personal_space" }, 403);
    strictEqual(await client.getBilling(), null);
  });

  it("degrades a 503 to null (billing-off deployment — no GW_STRIPE_* config)", async () => {
    const { client } = makeClient({ error: "billing not configured" }, 503);
    strictEqual(await client.getBilling(), null);
  });

  it("does NOT degrade a non-404/403/503 error (throws)", async () => {
    const { client } = makeClient({}, 500);
    await rejects(() => client.getBilling(), HoustonEngineError);
  });
});

describe("HoustonClient C8 billing — createCheckout", () => {
  it("POSTs /org/billing/checkout with {interval} and returns {url}", async () => {
    const { client, calls } = makeClient({ url: "https://stripe/checkout" });
    const got = await client.createCheckout("annual");
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/billing/checkout");
    deepStrictEqual(calls[0].body, { interval: "annual" });
    deepStrictEqual(got, { url: "https://stripe/checkout" });
  });

  it("does NOT degrade a 403 not_owner — checkout failure throws for the UI", async () => {
    const { client } = makeClient({ error: "not_owner" }, 403);
    await rejects(() => client.createCheckout("monthly"), HoustonEngineError);
  });
});

describe("HoustonClient C8 billing — createPortal", () => {
  it("POSTs /org/billing/portal and returns {url}", async () => {
    const { client, calls } = makeClient({ url: "https://stripe/portal" });
    const got = await client.createPortal();
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/billing/portal");
    deepStrictEqual(got, { url: "https://stripe/portal" });
  });

  it("does NOT degrade a 403 not_owner — portal failure throws for the UI", async () => {
    const { client } = makeClient({ error: "not_owner" }, 403);
    await rejects(() => client.createPortal(), HoustonEngineError);
  });
});
