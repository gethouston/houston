import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { BillingCommand, BillingHttpError } from "./index";

const ORG = "00000000000000aa";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

const SUMMARY = {
  plan: "team" as const,
  status: "trialing" as const,
  seats: 3,
};

/**
 * A billing SDK over a mock `fetch` that records the whole wire. `reactivity` is
 * off, so every recorded call is one a billing operation made and nothing else —
 * which is what makes "exactly one request" an exact claim.
 */
function makeSdk(answer: () => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return answer();
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(store),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const ok = (body: unknown) => makeSdk(() => json(body));

/** The three statuses a caller may read as "no subscription to show". */
const NOT_ENTITLED = [404, 403, 503];

describe("the billing requests", () => {
  it("reads the active org's summary off GET /v1/org/billing", async () => {
    const { sdk, calls } = ok(SUMMARY);
    expect(await sdk.billing.getBilling()).toEqual(SUMMARY);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/org/billing`, body: null },
    ]);
  });

  it("starts a monthly checkout with no interval in the body", async () => {
    const { sdk, calls } = ok({ url: "https://checkout.stripe.test/c/1" });
    expect(await sdk.billing.createCheckout()).toEqual({
      kind: "checkout",
      url: "https://checkout.stripe.test/c/1",
    });
    await sdk.billing.createCheckout({ interval: "month" });
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/org/billing/checkout`,
        body: "{}",
      },
      {
        method: "POST",
        url: `${BASE}/v1/org/billing/checkout`,
        body: "{}",
      },
    ]);
  });

  it("answers the gateway's interval refusals as outcomes, never throws", async () => {
    for (const [code, status] of [
      ["interval_unavailable", 409],
      ["invalid_interval", 400],
    ] as const) {
      const { sdk } = makeSdk(() => json({ code }, status));
      expect(await sdk.billing.createCheckout({ interval: "year" })).toEqual({
        kind: code,
      });
    }
    // A code under a status the contract does not pair it with still throws.
    const { sdk } = makeSdk(() => json({ code: "interval_unavailable" }, 400));
    await expect(
      sdk.billing.createCheckout({ interval: "year" }),
    ).rejects.toBeInstanceOf(BillingHttpError);
  });

  it("starts a yearly checkout by naming the interval", async () => {
    const { sdk, calls } = ok({ url: "https://checkout.stripe.test/c/2" });
    await sdk.billing.createCheckout({ interval: "year" });
    expect(calls[0].body).toBe(JSON.stringify({ interval: "year" }));
  });

  it("opens the customer portal with a bodyless POST", async () => {
    const { sdk, calls } = ok({ url: "https://billing.stripe.test/p/1" });
    expect(await sdk.billing.createPortal()).toEqual({
      url: "https://billing.stripe.test/p/1",
    });
    expect(calls).toEqual([
      { method: "POST", url: `${BASE}/v1/org/billing/portal`, body: null },
    ]);
  });
});

describe("what the module refuses to soften", () => {
  // The not-entitled trio is the whole point: a surface that cannot tell "no
  // subscription to show" from "could not ask" shows the user a lie, so the
  // reading stays with the surface and the SDK reports the status it got.
  for (const status of NOT_ENTITLED) {
    it(`throws a BillingHttpError carrying the status — a ${status} never degrades`, async () => {
      const { sdk } = makeSdk(() => json({ error: "no billing here" }, status));
      const err = await sdk.billing.getBilling().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BillingHttpError);
      expect((err as BillingHttpError).status).toBe(status);
      // The body travels as the message, which is what the web adapter parses
      // back into a HoustonEngineError.
      expect((err as BillingHttpError).message).toBe(
        JSON.stringify({ error: "no billing here" }),
      );
    });
  }

  it("a 403 not_billing_owner on a checkout reaches the caller", async () => {
    const { sdk } = makeSdk(() => json({ code: "not_billing_owner" }, 403));
    await expect(sdk.billing.createCheckout()).rejects.toBeInstanceOf(
      BillingHttpError,
    );
  });

  it("a portal failure reaches the caller with its body intact", async () => {
    const { sdk } = makeSdk(() => json({ error: "stripe down" }, 500));
    const err = await sdk.billing.createPortal().catch((e: unknown) => e);
    expect((err as BillingHttpError).status).toBe(500);
    expect((err as BillingHttpError).message).toBe(
      JSON.stringify({ error: "stripe down" }),
    );
  });
});

describe("the free-slot swap", () => {
  it("claims the active org with a bodyless POST", async () => {
    const { sdk, calls } = makeSdk(() => new Response(null, { status: 204 }));
    expect(await sdk.billing.claimFreeSlot()).toEqual({ kind: "claimed" });
    expect(calls).toEqual([
      { method: "POST", url: `${BASE}/v1/org/billing/free`, body: null },
    ]);
  });

  it("answers the caller's own states as outcomes", async () => {
    for (const [code, status] of [
      ["has_subscription", 409],
      ["not_billing_owner", 403],
    ] as const) {
      const { sdk } = makeSdk(() => json({ code, error: code }, status));
      expect(await sdk.billing.claimFreeSlot()).toEqual({ kind: code });
    }
  });

  it("throws a code on the wrong status, and every other failure", async () => {
    for (const answer of [
      json({ code: "has_subscription" }, 403),
      json({ error: "boom" }, 500),
    ]) {
      const { sdk } = makeSdk(() => answer);
      await expect(sdk.billing.claimFreeSlot()).rejects.toBeInstanceOf(
        BillingHttpError,
      );
    }
  });
});

describe("a free org's routines and presence", () => {
  it("lists, keeps, resumes and reports on the active org's routes", async () => {
    const { sdk, calls } = ok({ routines: [] });
    await sdk.billing.listPlanRoutines();
    await sdk.billing.keepRoutine({
      orgSlug: ORG,
      agentSlug: "writer",
      routineId: "r1",
    });
    await sdk.billing.resumeRoutines();
    await sdk.billing.reportPresence();
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/me/routines`, body: null },
      {
        method: "PUT",
        url: `${BASE}/v1/me/routines/keep`,
        body: JSON.stringify({
          orgSlug: ORG,
          agentSlug: "writer",
          routineId: "r1",
        }),
      },
      { method: "POST", url: `${BASE}/v1/me/routines/resume`, body: null },
      { method: "POST", url: `${BASE}/v1/me/presence`, body: null },
    ]);
  });

  it("rejects an incomplete keep key before sending", async () => {
    const { sdk, calls } = ok({});
    const result = await sdk.dispatch({
      id: "1",
      type: BillingCommand.KeepRoutine,
      payload: { routineId: "r1" },
    });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("the dispatch path", () => {
  it("dispatches a checkout through the same handler the facade uses", async () => {
    const { sdk, calls } = ok({ url: "https://checkout.stripe.test/c/1" });
    const result = await sdk.dispatch({
      id: "1",
      type: BillingCommand.CreateCheckout,
    });
    expect(result.ok).toBe(true);
    expect(calls[0].body).toBe("{}");
  });

  it("dispatches a yearly checkout and refuses an interval it does not sell", async () => {
    const { sdk, calls } = ok({ url: "https://checkout.stripe.test/c/1" });
    const yearly = await sdk.dispatch({
      id: "1",
      type: BillingCommand.CreateCheckout,
      payload: { interval: "year" },
    });
    expect(yearly.ok).toBe(true);
    expect(calls[0].body).toBe(JSON.stringify({ interval: "year" }));
    const weekly = await sdk.dispatch({
      id: "2",
      type: BillingCommand.CreateCheckout,
      payload: { interval: "week" },
    });
    expect(weekly.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("reads the summary through dispatch with no payload at all", async () => {
    const { sdk, calls } = ok(SUMMARY);
    const result = await sdk.dispatch({ id: "3", type: BillingCommand.Get });
    expect(result).toMatchObject({ ok: true, value: SUMMARY });
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/org/billing`, body: null },
    ]);
  });
});
