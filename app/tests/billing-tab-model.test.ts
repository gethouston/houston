import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { BillingSummary } from "@houston-ai/engine-client";
import {
  billingAction,
  isSubscribed,
  trialDaysLeft,
} from "../src/components/organization/billing-tab-model.ts";

const NOW = new Date("2026-07-08T12:00:00Z");

function billing(patch: Partial<BillingSummary>): BillingSummary {
  return { plan: "team", status: "free", seats: 2, ...patch };
}

describe("isSubscribed", () => {
  it("is true for active and past_due", () => {
    strictEqual(isSubscribed(billing({ status: "active" })), true);
    strictEqual(isSubscribed(billing({ status: "past_due" })), true);
  });

  it("is true when an interval is set (proof of a subscription)", () => {
    strictEqual(
      isSubscribed(billing({ status: "trialing", interval: "annual" })),
      true,
    );
  });

  it("is false for free / trialing / expired without an interval", () => {
    strictEqual(isSubscribed(billing({ status: "free" })), false);
    strictEqual(isSubscribed(billing({ status: "trialing" })), false);
    strictEqual(isSubscribed(billing({ status: "expired" })), false);
  });
});

describe("billingAction", () => {
  it("is none for a non-owner (admin sees billing read-only)", () => {
    strictEqual(billingAction(billing({ status: "expired" }), false), "none");
    strictEqual(billingAction(billing({ status: "active" }), false), "none");
  });

  it("is checkout for an owner on an unsubscribed team", () => {
    strictEqual(billingAction(billing({ status: "free" }), true), "checkout");
    strictEqual(
      billingAction(billing({ status: "trialing" }), true),
      "checkout",
    );
    strictEqual(
      billingAction(billing({ status: "expired" }), true),
      "checkout",
    );
  });

  it("is portal for an owner on a subscribed team", () => {
    strictEqual(billingAction(billing({ status: "active" }), true), "portal");
    strictEqual(billingAction(billing({ status: "past_due" }), true), "portal");
  });
});

describe("trialDaysLeft", () => {
  it("returns days left while trialing", () => {
    strictEqual(
      trialDaysLeft(
        billing({ status: "trialing", trialEndsAt: "2026-07-11T12:00:00Z" }),
        NOW,
      ),
      3,
    );
  });

  it("is null when not trialing", () => {
    strictEqual(trialDaysLeft(billing({ status: "active" }), NOW), null);
  });

  it("is null when trialing without a trial clock", () => {
    strictEqual(trialDaysLeft(billing({ status: "trialing" }), NOW), null);
  });
});
