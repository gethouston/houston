import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { BillingCommand, BillingHttpError } from "./index";
import { freeOrgBilling, paidOrgBilling } from "./org-billing-fixtures";
import { promoEndedModalOpens, promoEndedView } from "./price-notice";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

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

const NOTICE = {
  kind: "promo_ended" as const,
  previousCents: 1500,
  nextCents: 2000,
  renewsAt: "2026-11-14T17:00:00Z",
};

describe("the promo-ended calls", () => {
  it("switches to yearly with an empty POST and answers the org's billing", async () => {
    const billing = paidOrgBilling({ interval: "year", seatPriceCents: 18000 });
    const { sdk, calls } = ok({ billing });
    expect(await sdk.billing.switchToYearly()).toEqual({
      kind: "switched",
      billing,
    });
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/org/billing/switch-to-yearly`,
        body: "{}",
      },
    ]);
  });

  it("answers the owner's states as outcomes and throws everything else", async () => {
    for (const [code, status] of [
      ["payment_failed", 402],
      ["interval_unavailable", 409],
      ["already_yearly", 409],
      ["no_subscription", 409],
      ["switch_in_progress", 409],
    ] as const) {
      const { sdk } = makeSdk(() => json({ code }, status));
      expect(await sdk.billing.switchToYearly()).toEqual({ kind: code });
    }
    const { sdk } = makeSdk(() => json({ code: "not_billing_owner" }, 403));
    await expect(sdk.billing.switchToYearly()).rejects.toBeInstanceOf(
      BillingHttpError,
    );
  });

  it("dismisses the notice with an empty POST, also through dispatch", async () => {
    const { sdk, calls } = makeSdk(() => new Response(null, { status: 204 }));
    await sdk.billing.dismissPriceNotice();
    const result = await sdk.dispatch({
      id: "1",
      type: BillingCommand.DismissPriceNotice,
    });
    expect(result.ok).toBe(true);
    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ["POST", `${BASE}/v1/org/billing/price-notice/dismiss`, "{}"],
      ["POST", `${BASE}/v1/org/billing/price-notice/dismiss`, "{}"],
    ]);
  });
});

describe("promoEndedView", () => {
  it("reads the notice for the billing owner of a paid org", () => {
    expect(
      promoEndedView(
        paidOrgBilling({ interval: "month", priceNotice: NOTICE }),
      ),
    ).toEqual({
      previousCents: 1500,
      nextCents: 2000,
      renewsAt: NOTICE.renewsAt,
      seats: 3,
      prices: { monthlyCents: 2000, annualCents: 18000 },
    });
  });

  it("is null for anyone else, a free org, or no notice", () => {
    expect(
      promoEndedView(
        paidOrgBilling({ priceNotice: NOTICE, isBillingOwner: false }),
      ),
    ).toBeNull();
    expect(promoEndedView(freeOrgBilling({ priceNotice: NOTICE }))).toBeNull();
    expect(promoEndedView(paidOrgBilling())).toBeNull();
    expect(promoEndedView(null)).toBeNull();
  });

  it("opens once, and only with no other plan modal up", () => {
    const view = promoEndedView(paidOrgBilling({ priceNotice: NOTICE }));
    const open = (closedThisSession: boolean, otherDialogOpen: boolean) =>
      promoEndedModalOpens(view, { closedThisSession, otherDialogOpen });
    expect(open(false, false)).toBe(true);
    expect(open(true, false)).toBe(false);
    expect(open(false, true)).toBe(false);
    expect(
      promoEndedModalOpens(null, {
        closedThisSession: false,
        otherDialogOpen: false,
      }),
    ).toBe(false);
  });
});
