import type { PlanSummary } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { billingCards, planOffer, planUsageMode } from "./billing-model";

const NOW = Date.parse("2026-10-05T00:00:00Z");
const free: PlanSummary = {
  plan: "free",
  announcement: false,
  usage: {
    percent: 100,
    used: 40,
    limit: 40,
    resetsAt: "2026-10-05T03:00:00Z",
  },
  plus: {
    status: "none",
    manageable: false,
    price: { amount: 1500, currency: "usd", interval: "month" },
  },
  routines: {
    paused: false,
    maxActive: 1,
    minIntervalMinutes: 15,
    needsChoice: false,
    limitedCount: 0,
  },
};

describe("the beta tester gift", () => {
  const gifted: PlanSummary = {
    ...free,
    plus: { ...free.plus, offer: { amount: 1000, currency: "usd" } },
  };

  it("shows the first month's price while the person is eligible", () => {
    expect(planOffer(gifted, "en-US")).toEqual({ amount: "$10" });
  });

  it("never shows it on Plus or without an offer", () => {
    expect(planOffer({ ...gifted, plan: "plus" }, "en-US")).toBeNull();
    expect(planOffer(free, "en-US")).toBeNull();
  });
});

describe("Manage follows a real Stripe customer", () => {
  it("hides Manage for operator-granted Plus", () => {
    const operator: PlanSummary = {
      ...free,
      plan: "plus",
      plus: { ...free.plus, status: "active", manageable: false },
    };
    expect(billingCards(operator).manage).toBe(false);
    expect(
      billingCards({
        ...operator,
        plus: { ...operator.plus, manageable: true },
      }).manage,
    ).toBe(true);
  });
});

describe("the Plan screen's usage", () => {
  it("previews usage before the launch, then shows it as current", () => {
    const launching = { ...free, limitsStartAt: "2026-10-06T00:00:00Z" };
    expect(planUsageMode(launching, NOW)).toBe("preview");
    expect(planUsageMode(launching, Date.parse("2026-10-06T00:00:00Z"))).toBe(
      "current",
    );
    expect(planUsageMode({ ...free, plan: "plus" }, NOW)).toBe("none");
  });
});
