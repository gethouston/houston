import { readOrgsList } from "@houston/wire-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeHost, startFakeHost } from "./server";

const TEAM = "00000000000000ab";
const PROMO = {
  tier: "paid",
  status: "active",
  lockAt: null,
  lockReason: null,
  freeSlot: false,
  isBillingOwner: true,
  seats: 3,
  interval: "month",
  seatPriceCents: 1500,
  seatPrices: { monthlyCents: 2000, annualCents: 18000 },
  seatGraceEndsAt: null,
  renewsAt: "2026-11-14T17:00:00.000Z",
  priceNotice: {
    kind: "promo_ended",
    previousCents: 1500,
    nextCents: 2000,
    renewsAt: "2026-11-14T17:00:00.000Z",
  },
  nextAdjustment: null,
  usage: null,
  routines: null,
};

describe("the promo-ended routes on the fake gateway", () => {
  let host: FakeHost;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${host.url}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-houston-org": TEAM },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const team = async () =>
    readOrgsList(await (await send("GET", "/v1/orgs")).json()).orgs.find(
      (org) => org.slug === TEAM,
    )?.billing;

  beforeEach(async () => {
    host = await startFakeHost(0);
    await send("POST", "/__test__/reset");
    await send("POST", "/__test__/capabilities", { spaces: true });
    await send("POST", "/__test__/workspaces", {
      teams: [{ slug: TEAM, name: "Acme", billing: PROMO }],
    });
  });
  afterEach(async () => {
    await host.stop();
  });

  it("switches to yearly, clearing the notice", async () => {
    const res = await send("POST", "/v1/org/billing/switch-to-yearly", {});
    expect(res.status).toBe(200);
    const { billing } = await res.json();
    expect(billing).toMatchObject({
      interval: "year",
      seatPriceCents: 18000,
      priceNotice: null,
      nextAdjustment: null,
    });
    expect((await team())?.priceNotice).toBeNull();
    const again = await send("POST", "/v1/org/billing/switch-to-yearly", {});
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "already_yearly" });
  });

  it("declines the card on request, changing nothing", async () => {
    await send("POST", "/__test__/switch-yearly", { decline: true });
    const res = await send("POST", "/v1/org/billing/switch-to-yearly", {});
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "payment_failed" });
    expect((await team())?.interval).toBe("month");
  });

  it("dismisses the notice", async () => {
    const res = await send("POST", "/v1/org/billing/price-notice/dismiss", {});
    expect(res.status).toBe(204);
    expect((await team())?.priceNotice).toBeNull();
  });
});
