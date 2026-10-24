import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgBilling } from "@houston/engine-adapter";
import {
  billingAction,
  billingStatus,
  scheduledLock,
} from "../src/components/organization/billing-tab-model.ts";

const NOW = Date.parse("2026-10-21T12:00:00Z");

function free(patch: Partial<OrgBilling> = {}): OrgBilling {
  return {
    tier: "free",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: true,
    isBillingOwner: true,
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
      resetsAt: "2026-10-26T00:00:00Z",
    },
    routines: null,
    ...patch,
  };
}

function paid(patch: Partial<OrgBilling> = {}): OrgBilling {
  return free({ tier: "paid", freeSlot: false, usage: null, ...patch });
}

describe("billingAction", () => {
  it("offers the billing owner checkout on a free org and the portal on a paid one", () => {
    strictEqual(billingAction(free(), true), "checkout");
    strictEqual(billingAction(paid(), true), "portal");
  });

  it("offers checkout on a free org locked unpaid, and the portal on a paid org past due", () => {
    strictEqual(
      billingAction(free({ status: "locked", lockReason: "unpaid" }), true),
      "checkout",
    );
    strictEqual(billingAction(paid({ status: "past_due" }), true), "portal");
  });

  it("follows orgRecovery for a locked paid org: checkout once the subscription ended", () => {
    strictEqual(
      billingAction(
        paid({
          status: "locked",
          lockAt: "2026-10-01T00:00:00Z",
          lockReason: "canceled",
        }),
        true,
      ),
      "checkout",
    );
    strictEqual(
      billingAction(
        paid({
          status: "locked",
          lockAt: "2026-10-01T00:00:00Z",
          lockReason: "payment_failed",
        }),
        true,
      ),
      "portal",
    );
  });

  it("sends the billing owner to the web inside a store app", () => {
    strictEqual(billingAction(free(), false), "web");
    strictEqual(billingAction(paid(), false), "web");
  });

  it("tells every other owner and admin to ask the owner, in any state and app", () => {
    for (const billing of [free(), paid(), paid({ status: "past_due" })])
      for (const purchasable of [true, false])
        strictEqual(
          billingAction({ ...billing, isBillingOwner: false }, purchasable),
          "ask_owner",
        );
  });
});

describe("billingStatus", () => {
  it("names the plan while it is active", () => {
    strictEqual(billingStatus(free()), "free");
    strictEqual(billingStatus(paid()), "paid");
  });

  it("lets a payment problem or a lock outrank the plan", () => {
    strictEqual(billingStatus(paid({ status: "past_due" })), "past_due");
    strictEqual(billingStatus(free({ status: "locked" })), "locked");
    strictEqual(billingStatus(paid({ status: "locked" })), "locked");
  });
});

describe("scheduledLock", () => {
  it("is the date of a lock still ahead", () => {
    strictEqual(
      scheduledLock(free({ lockAt: "2026-11-04T00:00:00Z" }), NOW),
      "2026-11-04T00:00:00Z",
    );
  });

  it("is null with no lock, a lock already reached, or a locked org", () => {
    strictEqual(scheduledLock(free(), NOW), null);
    strictEqual(
      scheduledLock(free({ lockAt: "2026-10-01T00:00:00Z" }), NOW),
      null,
    );
    strictEqual(
      scheduledLock(
        free({ status: "locked", lockAt: "2026-11-04T00:00:00Z" }),
        NOW,
      ),
      null,
    );
  });
});
