import { describe, expect, it } from "vitest";
import { billingChoiceSchema } from "./billing-choice";

const CHOICE = {
  needed: true,
  payer: null,
  state: "pending",
  provisional: false,
  cutoverAt: "2026-10-23T05:00:00Z",
  changeableUntil: null,
  noticeDismissed: false,
  freeOrgSlug: null,
  paidOrgSlug: null,
  orgs: [],
};

describe("billingChoiceSchema seatPrices", () => {
  it("reads the list prices the choice carries", () => {
    const prices = { monthlyCents: 2000, annualCents: null };
    expect(
      billingChoiceSchema.parse({ ...CHOICE, seatPrices: prices }).seatPrices,
    ).toEqual(prices);
    expect(
      billingChoiceSchema.parse({ ...CHOICE, seatPrices: null }).seatPrices,
    ).toBeNull();
  });

  it("keeps the choice when an older gateway omits them or sends junk", () => {
    expect(billingChoiceSchema.parse(CHOICE).seatPrices).toBeUndefined();
    expect(
      billingChoiceSchema.parse({
        ...CHOICE,
        seatPrices: { monthlyCents: "x" },
      }).seatPrices,
    ).toBeNull();
  });
});
