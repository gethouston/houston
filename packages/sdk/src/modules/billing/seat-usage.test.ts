import { describe, expect, it } from "vitest";
import { paidOrgBilling } from "./org-billing-fixtures";
import { orgBillingPrice } from "./seat-price";
import { billingRenewal, seatUsageView } from "./seat-usage";

const RENEWS = "2027-03-26T12:00:00Z";
const yearly = paidOrgBilling({
  interval: "year",
  seatPriceCents: 18000,
  renewsAt: RENEWS,
  seats: 2,
  paidSeats: 3,
  seatsInUse: 2,
});

describe("seatUsageView", () => {
  it("counts the free paid seats of a live yearly org", () => {
    expect(seatUsageView(yearly)).toEqual({ paidSeats: 3, inUse: 2, free: 1 });
    expect(
      seatUsageView({ ...yearly, paidSeats: 2, seatsInUse: 3 })?.free,
    ).toBe(0);
  });

  it("is null without the counts, on a monthly org, and on a free one", () => {
    expect(seatUsageView({ ...yearly, paidSeats: null })).toBeNull();
    expect(seatUsageView({ ...yearly, interval: "month" })).toBeNull();
    expect(seatUsageView({ ...yearly, tier: "free" })).toBeNull();
    expect(seatUsageView(null)).toBeNull();
  });
});

describe("billingRenewal", () => {
  it("renews a yearly plan and bills a monthly one next", () => {
    expect(billingRenewal(yearly)).toEqual({ kind: "renews", at: RENEWS });
    expect(billingRenewal({ ...yearly, interval: "month" })).toEqual({
      kind: "next_bill",
      at: RENEWS,
    });
  });

  it("is null without a date, an interval, or a paid plan", () => {
    expect(billingRenewal({ ...yearly, renewsAt: null })).toBeNull();
    expect(billingRenewal({ ...yearly, interval: null })).toBeNull();
    expect(billingRenewal({ ...yearly, tier: "free" })).toBeNull();
  });
});

describe("orgBillingPrice on a yearly org", () => {
  it("bills the paid seats, not the members", () => {
    expect(orgBillingPrice(yearly, Date.parse("2026-10-26T00:00:00Z"))).toEqual(
      {
        kind: "priced",
        interval: "year",
        total: 54000,
        today: null,
        graceEndsAt: null,
      },
    );
  });
});
