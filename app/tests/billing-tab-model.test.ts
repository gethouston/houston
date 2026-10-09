import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { BillingSummary } from "@houston/engine-adapter";
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
    strictEqual(
      billingAction(billing({ status: "expired" }), false, true),
      "none",
    );
    strictEqual(
      billingAction(billing({ status: "active" }), false, true),
      "none",
    );
  });

  it("is checkout for an owner on an unsubscribed team", () => {
    strictEqual(
      billingAction(billing({ status: "free" }), true, true),
      "checkout",
    );
    strictEqual(
      billingAction(billing({ status: "trialing" }), true, true),
      "checkout",
    );
    strictEqual(
      billingAction(billing({ status: "expired" }), true, true),
      "checkout",
    );
  });

  it("is portal for an owner on a subscribed team", () => {
    strictEqual(
      billingAction(billing({ status: "active" }), true, true),
      "portal",
    );
    strictEqual(
      billingAction(billing({ status: "past_due" }), true, true),
      "portal",
    );
  });

  it("is web for an owner inside a store app, whatever the status", () => {
    for (const status of ["free", "trialing", "expired", "active"] as const)
      strictEqual(billingAction(billing({ status }), true, false), "web");
  });

  it("stays none for a non-owner inside a store app", () => {
    strictEqual(
      billingAction(billing({ status: "expired" }), false, false),
      "none",
    );
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
