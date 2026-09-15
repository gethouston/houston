import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";
import {
  type Call,
  createWireCapture,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The billing family rides `sdk.billing`. What this file pins is the WIRE: the
 * three gateway routes, their methods, their bodies, and the headers that carry
 * auth and the active space — the whole recorded request, because `/v1/org/
 * billing/checkout` and `/v1/org/billing/portal` differ by one segment and a
 * substring match would let one stand in for the other.
 *
 * Each case drives the composed `HoustonClient` (what the app holds), not the
 * SDK. The one degradation this family has stays in the mixin, so the statuses
 * it softens — and the ones it must not — are pinned here too; the deeper
 * not-entitled story lives in `billing-degrade.test.ts`.
 */

const BASE = "https://gw.example";

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  reset();
});

afterEach(() => {
  restore();
  // Unconditionally, so a case that fails mid-ladder cannot leave fake timers
  // installed for the next one.
  vi.useRealTimers();
  vi.clearAllMocks();
});

const SUMMARY = {
  plan: "team",
  status: "trialing",
  seats: 3,
  trialEndsAt: "2026-10-01T00:00:00.000Z",
};

const CHECKOUT = { url: "https://checkout.stripe.test/c/pay_1" };

/** The three statuses the mixin reads as "no subscription to show". */
const NOT_ENTITLED = [404, 403, 503];

/** A cloud client with a team space active, so `x-houston-org` is live. */
function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
}

/** The single request the call made, with the shared headers already checked. */
function soleCall(): Call {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
  return call;
}

describe("the delegated billing requests", () => {
  test("getBilling GETs /v1/org/billing", async () => {
    stubFetch(() => json(200, SUMMARY));
    expect(await client().getBilling()).toEqual(SUMMARY);
    const call = soleCall();
    expect(call.method).toBe("GET");
    expect(call.url).toBe(`${BASE}/v1/org/billing`);
    expect(call.body).toBeNull();
  });

  test("createCheckout POSTs the interval as the whole body", async () => {
    stubFetch(() => json(200, CHECKOUT));
    expect(await client().createCheckout("annual")).toEqual(CHECKOUT);
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/v1/org/billing/checkout`);
    expect(call.body).toBe(JSON.stringify({ interval: "annual" }));
  });

  test("createPortal POSTs the portal route with no body", async () => {
    stubFetch(() => json(200, { url: "https://billing.stripe.test/p/1" }));
    expect(await client().createPortal()).toEqual({
      url: "https://billing.stripe.test/p/1",
    });
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/v1/org/billing/portal`);
    expect(call.body).toBeNull();
  });

  test("the monthly interval reaches the wire as the caller spelled it", async () => {
    stubFetch(() => json(200, CHECKOUT));
    await client().createCheckout("monthly");
    expect(soleCall().body).toBe(JSON.stringify({ interval: "monthly" }));
  });
});

describe("what the mixin softens, and what it must not", () => {
  for (const status of NOT_ENTITLED) {
    test(`a ${status} on getBilling is a team with no billing to show`, async () => {
      // 503 is transient for reads, so the shared read ladder re-attempts twice
      // before the degrade sees it; fake timers fast-forward those waits.
      vi.useFakeTimers();
      stubFetch(() => json(status, { error: "no billing" }));
      const read = client().getBilling();
      await vi.runAllTimersAsync();
      expect(await read).toBeNull();
    });
  }

  test("any other getBilling failure reaches the caller", async () => {
    stubFetch(() => json(500, { error: "boom" }));
    await expect(client().getBilling()).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
  });

  test("checkout and portal never degrade — a 403 not_owner throws", async () => {
    stubFetch(() => json(403, { error: "not_owner" }));
    const c = client();
    await expect(c.createCheckout("annual")).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
    await expect(c.createPortal()).rejects.toBeInstanceOf(HoustonEngineError);
  });

  test("a rejection keeps the gateway's parsed body and status", async () => {
    stubFetch(() => json(402, { error: "card declined", code: "card_error" }));
    const err = await client()
      .createCheckout("monthly")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(402);
    expect((err as HoustonEngineError).body).toMatchObject({
      code: "card_error",
    });
  });
});
