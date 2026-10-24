import { describe, expect, it } from "vitest";
import { parseOrgBilling, readCreatedOrg, readOrgsList } from "./org-billing";

const BILLING = {
  tier: "free",
  status: "active",
  lockAt: null,
  lockReason: null,
  freeSlot: true,
  isBillingOwner: false,
  seats: 3,
  interval: null,
  seatPriceCents: 2000,
  seatPrices: { monthlyCents: 2000, annualCents: 18000 },
  seatGraceEndsAt: null,
  renewsAt: null,
  priceNotice: null,
  nextAdjustment: null,
  usage: {
    scope: "org",
    used: 12,
    limit: 40,
    resetsAt: "2026-10-30T00:00:00Z",
  },
  routines: {
    paused: false,
    kept: null,
    needsChoice: false,
    limitedCount: 0,
    maxActive: 1,
    minIntervalMinutes: 15,
  },
};

describe("parseOrgBilling", () => {
  it("reads the org billing every member is sent", () => {
    expect(parseOrgBilling(BILLING)).toEqual(BILLING);
  });

  it("reads a legacy org, an older team summary, and junk as null", () => {
    expect(parseOrgBilling(undefined)).toBeNull();
    expect(
      parseOrgBilling({ plan: "team", status: "trialing", seats: 3 }),
    ).toBeNull();
    expect(parseOrgBilling({ ...BILLING, tier: "plus" })).toBeNull();
    expect(parseOrgBilling({ ...BILLING, lockAt: "soon" })).toBeNull();
  });

  it("reads a yearly subscription and a deployment with no yearly seat", () => {
    const yearly = {
      ...BILLING,
      tier: "paid",
      interval: "year",
      seatPriceCents: 18000,
    };
    expect(parseOrgBilling(yearly)).toEqual(yearly);
    const monthlyOnly = {
      ...BILLING,
      seatPrices: { monthlyCents: 2000, annualCents: null },
    };
    expect(parseOrgBilling(monthlyOnly)).toEqual(monthlyOnly);
  });

  it("reads a gateway that predates intervals as monthly only", () => {
    const { interval: _, seatPrices: __, ...older } = BILLING;
    expect(parseOrgBilling({ ...older, seatPriceCents: 1500 })).toEqual({
      ...BILLING,
      seatPriceCents: 1500,
      seatPrices: { monthlyCents: 1500, annualCents: null },
    });
    expect(parseOrgBilling({ ...BILLING, interval: "week" })?.interval).toBe(
      null,
    );
  });

  it("reads a live subscription whose price is not read yet", () => {
    const pending = {
      ...BILLING,
      tier: "paid",
      interval: null,
      seatPriceCents: null,
    };
    expect(parseOrgBilling(pending)).toEqual(pending);
    // With no list prices either, no checkout price is known at all.
    const { seatPrices: _, ...bare } = pending;
    expect(parseOrgBilling(bare)?.seatPrices).toBeNull();
  });

  it("reads a promo-ended notice and the next charge", () => {
    const notice = {
      kind: "promo_ended",
      previousCents: 1500,
      nextCents: 2000,
      renewsAt: "2026-11-14T17:00:00Z",
    };
    const promo = {
      ...BILLING,
      tier: "paid",
      interval: "month",
      seatPriceCents: 1500,
      renewsAt: "2026-11-14T17:00:00Z",
      priceNotice: notice,
    };
    expect(parseOrgBilling(promo)).toEqual(promo);
    // An older gateway omits both; a notice kind added later reads as none.
    const { renewsAt: _, priceNotice: __, ...older } = BILLING;
    expect(parseOrgBilling(older)).toEqual(BILLING);
    expect(
      parseOrgBilling({ ...promo, priceNotice: { ...notice, kind: "other" } })
        ?.priceNotice,
    ).toBeNull();
  });

  it("reads a yearly org's next adjustment, a charge or a credit", () => {
    const yearly = {
      ...BILLING,
      tier: "paid",
      interval: "year",
      seatPriceCents: 18000,
      isBillingOwner: true,
      renewsAt: "2027-10-24T14:19:10Z",
      nextAdjustment: {
        kind: "charge",
        amountCents: 18000,
        at: "2026-11-24T14:19:10Z",
      },
    };
    expect(parseOrgBilling(yearly)).toEqual(yearly);
    const credit = {
      ...yearly,
      nextAdjustment: {
        kind: "credit",
        amountCents: 4500,
        at: "2026-11-24T14:19:10Z",
      },
    };
    expect(parseOrgBilling(credit)).toEqual(credit);
    // An older gateway omits it; a kind added later, or a zero or signed
    // amount, reads as none and keeps the rest of the billing.
    const { nextAdjustment: _, ...older } = yearly;
    expect(parseOrgBilling(older)?.nextAdjustment).toBeNull();
    for (const odd of [
      { ...yearly.nextAdjustment, kind: "refund" },
      { ...yearly.nextAdjustment, amountCents: 0 },
      { ...yearly.nextAdjustment, amountCents: -4500 },
      { ...yearly.nextAdjustment, at: "soon" },
    ]) {
      const parsed = parseOrgBilling({ ...yearly, nextAdjustment: odd });
      expect(parsed?.nextAdjustment).toBeNull();
      expect(parsed?.interval).toBe("year");
    }
  });

  it("reads malformed list prices as monthly only, keeping the billing", () => {
    expect(
      parseOrgBilling({ ...BILLING, seatPrices: { monthlyCents: "20" } }),
    ).toEqual({
      ...BILLING,
      seatPrices: { monthlyCents: 2000, annualCents: null },
    });
  });

  it("keeps the state when a later gateway adds a lock reason", () => {
    expect(
      parseOrgBilling({
        ...BILLING,
        lockAt: "2026-11-01T00:00:00Z",
        lockReason: "transfer",
      }),
    ).toEqual({ ...BILLING, lockAt: "2026-11-01T00:00:00Z", lockReason: null });
  });
});

describe("the org list and a create", () => {
  const org = {
    id: "o1",
    slug: "00000000000000aa",
    name: "Acme",
    kind: "team",
    role: "owner",
    memberCount: 3,
    degraded: false,
  };

  it("parses every org's billing and the free slot", () => {
    expect(
      readOrgsList({
        orgs: [{ ...org, billing: BILLING }, org],
        invites: [],
        freeOrg: { available: true, orgSlug: null },
      }),
    ).toEqual({
      orgs: [
        { ...org, billing: BILLING },
        { ...org, billing: null },
      ],
      invites: [],
      freeOrg: { available: true, orgSlug: null },
    });
    expect(readOrgsList({ orgs: [], invites: [] }).freeOrg).toBeNull();
  });

  it("reads a paid create's checkout beside the org", () => {
    expect(readCreatedOrg({ ...org, checkoutUrl: "https://c.test/1" })).toEqual(
      {
        kind: "checkout",
        org: { ...org, billing: null },
        checkoutUrl: "https://c.test/1",
      },
    );
    expect(readCreatedOrg(org)).toEqual({
      kind: "created",
      org: { ...org, billing: null },
    });
  });
});
