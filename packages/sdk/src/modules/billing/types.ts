/**
 * Wire types + command vocabulary for the billing module (C8) — the active
 * team's Stripe subscription and the two hosted-page hand-offs it opens.
 *
 * Everything here is plain JSON, so it crosses the bridge's `dispatch` boundary
 * unchanged. There is no reactive scope: the summary is read when a billing
 * screen opens and each hand-off is a button's one-shot, so the module is
 * plain-async and publishes nothing (the SDK's preferences shape).
 *
 * The summary itself is {@link BillingSummary}, declared with the spaces module
 * because it also rides `OrgSummary.billing` — one declaration, so the shape a
 * space carries and the shape this family reads can never drift apart.
 */

import { requireString } from "../payload";

/** The write vocabulary — the same handlers back the facade and the bridge. */
export const BillingCommand = {
  Get: "billing/get",
  CreateCheckout: "billing/createCheckout",
  CreatePortal: "billing/createPortal",
} as const;

export type BillingCommandType =
  (typeof BillingCommand)[keyof typeof BillingCommand];

/**
 * The runtime mirror of the intervals a subscription is billed on — a bridge
 * payload arrives untyped, and a union is not a value to check it against. An
 * interval Stripe starts offering must be added here too, or this module
 * refuses it.
 */
export const BILLING_INTERVALS = ["monthly", "annual"] as const;

/**
 * A Stripe-hosted URL to redirect the owner to (C8 §Billing wire surface).
 * Returned by `POST /v1/org/billing/checkout` (contextual card capture) and
 * `POST /v1/org/billing/portal` (card, invoices, interval switch, cancel). The
 * client opens it via the OS external-open path — never inline.
 */
export interface BillingCheckout {
  url: string;
}

/** An interval off an untrusted command payload, refused unless we know it. */
export function requireInterval(
  payload: unknown,
  key: string,
): "monthly" | "annual" {
  const value = requireString(payload, key);
  const interval = BILLING_INTERVALS.find((known) => known === value);
  if (!interval) {
    throw new Error(`'${key}' must be one of ${BILLING_INTERVALS.join(", ")}`);
  }
  return interval;
}
