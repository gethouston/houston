import type { BillingChoice, OrgsList } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { freeOrgBilling, paidOrgBilling } from "./org-billing-fixtures";
import {
  checkoutIntervalField,
  checkoutTotal,
  DEFAULT_CHECKOUT_INTERVAL,
  listSeatPrices,
  orgBillingPrice,
  payerSeatCents,
  seatPlans,
  sellableInterval,
  sellsYearly,
  yearlySavingsPercent,
} from "./seat-price";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const BOTH = { monthlyCents: 2000, annualCents: 18000 };
const MONTHLY_ONLY = { monthlyCents: 2000, annualCents: null };

describe("seatPlans", () => {
  it("offers monthly, then yearly spread over twelve months", () => {
    expect(seatPlans(BOTH)).toEqual([
      { interval: "month", seatCents: 2000, perMonthCents: 2000 },
      { interval: "year", seatCents: 18000, perMonthCents: 1500 },
    ]);
  });

  it("offers monthly alone where no yearly seat is sold", () => {
    expect(seatPlans(MONTHLY_ONLY).map((plan) => plan.interval)).toEqual([
      "month",
    ]);
  });
});

describe("sellableInterval", () => {
  it("offers the choice only where a yearly seat is sold", () => {
    expect(sellsYearly(BOTH)).toBe(true);
    expect(sellsYearly(MONTHLY_ONLY)).toBe(false);
    expect(sellsYearly(null)).toBe(false);
  });

  it("preselects yearly and falls back to monthly where it is not sold", () => {
    expect(DEFAULT_CHECKOUT_INTERVAL).toBe("year");
    expect(sellableInterval(MONTHLY_ONLY, DEFAULT_CHECKOUT_INTERVAL)).toBe(
      "month",
    );
    expect(sellableInterval(BOTH, "year")).toBe("year");
    expect(sellableInterval(MONTHLY_ONLY, "year")).toBe("month");
  });
});

describe("checkoutTotal", () => {
  it("bills every member, at least one, per interval", () => {
    expect(checkoutTotal(BOTH, "month", 3)).toBe(6000);
    expect(checkoutTotal(BOTH, "year", 3)).toBe(54000);
    expect(checkoutTotal(BOTH, "year", 0)).toBe(18000);
    expect(checkoutTotal(MONTHLY_ONLY, "year", 2)).toBe(4000);
  });
});

describe("yearlySavingsPercent", () => {
  it("is what a year saves against twelve months, off the wire's prices", () => {
    expect(yearlySavingsPercent(BOTH)).toBe(25);
    expect(
      yearlySavingsPercent({ monthlyCents: 1000, annualCents: 10000 }),
    ).toBe(17);
  });

  it("is null where no yearly seat is sold or it saves nothing", () => {
    expect(yearlySavingsPercent(MONTHLY_ONLY)).toBeNull();
    expect(
      yearlySavingsPercent({ monthlyCents: 2000, annualCents: 24000 }),
    ).toBeNull();
  });
});

describe("checkoutIntervalField", () => {
  it("names yearly and leaves monthly as the absent field", () => {
    expect(checkoutIntervalField("year")).toBe("year");
    expect(checkoutIntervalField("month")).toBeUndefined();
    expect(checkoutIntervalField(undefined)).toBeUndefined();
  });
});

describe("listSeatPrices", () => {
  const org = (billing: OrgsList["orgs"][number]["billing"]) => ({
    id: "o",
    slug: "acme",
    name: "Acme",
    kind: "team" as const,
    role: "owner" as const,
    memberCount: 1,
    degraded: false,
    billing,
  });

  it("reads the list prices off the first org that has billing", () => {
    const list: OrgsList = {
      orgs: [org(null), org(freeOrgBilling({ seatPrices: MONTHLY_ONLY }))],
      invites: [],
      freeOrg: null,
    };
    expect(listSeatPrices(list)).toEqual(MONTHLY_ONLY);
  });

  it("is null while the list is unread or carries no billing", () => {
    expect(listSeatPrices(undefined)).toBeNull();
    expect(
      listSeatPrices({ orgs: [org(null)], invites: [], freeOrg: null }),
    ).toBeNull();
  });
});

describe("orgBillingPrice", () => {
  const monthly = (patch: Parameters<typeof paidOrgBilling>[0] = {}) =>
    paidOrgBilling({ interval: "month", ...patch });

  it("bills every member as a seat, per the subscription's interval", () => {
    expect(orgBillingPrice(monthly(), NOW)).toEqual({
      kind: "priced",
      interval: "month",
      total: 6000,
      today: null,
      graceEndsAt: null,
    });
    expect(
      orgBillingPrice(
        paidOrgBilling({ interval: "year", seatPriceCents: 18000 }),
        NOW,
      ),
    ).toMatchObject({ kind: "priced", interval: "year", total: 54000 });
  });

  it("names no figure where the wire states no interval", () => {
    // A comp grant, an ended subscription, an interval this client does not
    // know (parsed to null), and a free org with no subscription.
    expect(orgBillingPrice(paidOrgBilling({ interval: null }), NOW)).toEqual({
      kind: "unpriced",
    });
    expect(orgBillingPrice(freeOrgBilling(), NOW)).toEqual({
      kind: "unpriced",
    });
    // A live subscription whose price the gateway has not read yet.
    expect(
      orgBillingPrice(
        paidOrgBilling({ interval: null, seatPriceCents: null }),
        NOW,
      ),
    ).toEqual({ kind: "unpriced" });
    expect(
      orgBillingPrice(
        paidOrgBilling({ interval: "month", seatPriceCents: null }),
        NOW,
      ),
    ).toEqual({ kind: "unpriced" });
  });

  it("keeps a payer on the price they are billed", () => {
    expect(
      orgBillingPrice(monthly({ seatPriceCents: 1500 }), NOW),
    ).toMatchObject({ total: 4500 });
  });

  it("bills at least one seat", () => {
    expect(orgBillingPrice(monthly({ seats: 0 }), NOW)).toMatchObject({
      total: 2000,
    });
  });

  it("bills one seat until a seat grace ends, then every member", () => {
    expect(
      orgBillingPrice(
        paidOrgBilling({
          interval: "year",
          seatPriceCents: 18000,
          seatGraceEndsAt: "2026-11-20T00:00:00Z",
        }),
        NOW,
      ),
    ).toEqual({
      kind: "priced",
      interval: "year",
      total: 54000,
      today: 18000,
      graceEndsAt: "2026-11-20T00:00:00Z",
    });
  });

  it("drops a grace that ended, and one a single member never needed", () => {
    expect(
      orgBillingPrice(
        monthly({ seatGraceEndsAt: "2026-10-01T00:00:00Z" }),
        NOW,
      ),
    ).toMatchObject({ today: null });
    expect(
      orgBillingPrice(
        monthly({ seats: 1, seatGraceEndsAt: "2026-11-20T00:00:00Z" }),
        NOW,
      ),
    ).toMatchObject({ today: null });
  });
});

describe("payerSeatCents", () => {
  const choiceOrg = (patch: Partial<BillingChoice["orgs"][number]>) => ({
    slug: "acme",
    name: "Acme",
    personal: false,
    memberCount: 3,
    messages30d: 0,
    lastActiveOn: null,
    monthlyTotalCents: null,
    seatGraceEndsOn: null,
    lockAt: null,
    ...patch,
  });
  const choice = (orgs: BillingChoice["orgs"]) => ({ orgs }) as BillingChoice;

  it("reads what one member costs a payer off an org's monthly total", () => {
    expect(
      payerSeatCents(
        choice([choiceOrg({}), choiceOrg({ monthlyTotalCents: 4500 })]),
      ),
    ).toBe(1500);
  });

  it("is null when no org carries a total", () => {
    expect(payerSeatCents(choice([choiceOrg({})]))).toBeNull();
    expect(
      payerSeatCents(
        choice([choiceOrg({ memberCount: 0, monthlyTotalCents: 0 })]),
      ),
    ).toBeNull();
  });
});
