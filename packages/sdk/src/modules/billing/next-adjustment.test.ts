import { describe, expect, it } from "vitest";
import { nextAdjustmentView } from "./next-adjustment";
import { freeOrgBilling, paidOrgBilling } from "./org-billing-fixtures";

const NOW = Date.parse("2026-10-24T15:00:00Z");
const AT = "2026-11-24T14:19:10Z";

const yearly = (patch: Parameters<typeof paidOrgBilling>[0] = {}) =>
  paidOrgBilling({
    interval: "year",
    seatPriceCents: 18000,
    renewsAt: "2027-10-24T14:19:10Z",
    nextAdjustment: { kind: "charge", amountCents: 18000, at: AT },
    ...patch,
  });

describe("nextAdjustmentView", () => {
  it("names a yearly owner's next charge", () => {
    expect(nextAdjustmentView(yearly(), NOW)).toEqual({
      kind: "charge",
      amountCents: 18000,
      at: AT,
    });
  });

  it("names a credit as a credit", () => {
    const credit = yearly({
      nextAdjustment: { kind: "credit", amountCents: 4500, at: AT },
    });
    expect(nextAdjustmentView(credit, NOW)).toEqual({
      kind: "credit",
      amountCents: 4500,
      at: AT,
    });
  });

  it("names nothing when nothing is pending", () => {
    expect(nextAdjustmentView(yearly({ nextAdjustment: null }), NOW)).toBe(
      null,
    );
    expect(nextAdjustmentView(null, NOW)).toBeNull();
    expect(nextAdjustmentView(undefined, NOW)).toBeNull();
  });

  it("names nothing to anyone who does not pay, or off a yearly paid org", () => {
    expect(
      nextAdjustmentView(yearly({ isBillingOwner: false }), NOW),
    ).toBeNull();
    expect(nextAdjustmentView(yearly({ interval: "month" }), NOW)).toBeNull();
    expect(nextAdjustmentView(yearly({ interval: null }), NOW)).toBeNull();
    expect(
      nextAdjustmentView(
        freeOrgBilling({ nextAdjustment: yearly().nextAdjustment }),
        NOW,
      ),
    ).toBeNull();
  });

  it("drops it once its date passed", () => {
    expect(nextAdjustmentView(yearly(), Date.parse(AT))).toBeNull();
    expect(nextAdjustmentView(yearly(), Date.parse(AT) - 1)).not.toBeNull();
  });
});
