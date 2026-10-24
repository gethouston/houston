/**
 * The billing REST calls, over the injected `fetch`.
 *
 * These are HOSTED-GATEWAY routes: a subscription belongs to the managed
 * cloud's orgs, so no host serves them and the runtime client has no
 * surface for them. They go straight through {@link httpRequest} with literal
 * paths, which is also what keeps them visible to the assistant's operation
 * catalog.
 *
 * Nothing here degrades. A non-2xx throws a `BillingHttpError` (`index.ts`)
 * carrying the HTTP `status` (the swap's own refusals are its outcomes), and a surface that wants a softer answer (the web
 * adapter's "no billing to show" on a gateway with no Stripe) decides that for
 * itself on the status. A `401` additionally fires `onUnauthorized`, so a lapsed
 * session token becomes a visible `tokenExpired` signal.
 */

import {
  CLAIM_FREE_REFUSALS,
  type ClaimFreeRefusal,
  type SeatCheckoutOutcome,
} from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";
import { refusalCode, refusalStatus } from "../refusal-code";
import type { BillingSummary } from "../spaces/types";
import { seatIntervalRefusal } from "./seat-refusal";
import type { BillingCheckout } from "./types";

/**
 * Shows the plan and payment status of the organization.
 *
 * The active org's C8 billing summary. Throws on every failure, the
 * NOT-ENTITLED trio included: a gateway that predates billing (404), a caller
 * it refuses billing detail (403 plain member), and a billing-off deployment
 * (503 `billing not configured`). It is the SURFACE that reads those three as
 * "nothing to show". Usage, routine state and locks ride every org's
 * `billing` on `listOrgs`, which every member can read. Its top-level
 * `interval` keeps the older spelling (`monthly` / `annual`) for older apps;
 * read `billing.interval` (`month` / `year`).
 * @assistant group:billing
 */
export async function getBilling(scope: HttpScope): Promise<BillingSummary> {
  const res = await httpRequest(scope, "/v1/org/billing");
  return (await res.json()) as BillingSummary;
}

/**
 * Starts the checkout that puts the organization on a paid plan.
 *
 * Start a Stripe Checkout session for the active org, billed per seat every
 * month or once a year (billing owner only; anyone else gets 403
 * `not_billing_owner`). Yearly is sold only where the org's
 * `billing.seatPrices.annualCents` is set. Answers the hosted page as
 * `checkout`, or the interval refused as an outcome: `interval_unavailable`
 * (no yearly seat is sold here) or `invalid_interval`. Every other failure
 * throws so the UI surfaces the real reason.
 *
 * @param interval `year` when the user asked to pay yearly; leave it out to
 *   pay monthly.
 * @assistant group:billing
 * @assistant confirm: money. It starts a real subscription, and the card it charges is the user's own.
 */
export async function createCheckout(
  scope: HttpScope,
  interval?: "year",
): Promise<SeatCheckoutOutcome> {
  try {
    const res = await httpRequest(scope, "/v1/org/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ interval }),
    });
    const { url } = (await res.json()) as BillingCheckout;
    return { kind: "checkout", url };
  } catch (err) {
    const refusal = seatIntervalRefusal(err);
    if (refusal) return { kind: refusal };
    throw err;
  }
}

/**
 * Opens the billing page where the user can change the card, see invoices, or cancel.
 *
 * Open the Stripe customer portal for the active org (billing owner only):
 * card, invoices, cancel. Returns the hosted `{url}`. Never degrades.
 * @assistant group:billing hidden: answers with a live Stripe portal session URL, which is a signed-in billing session for anyone who holds it; the person opens billing from the app instead of being handed a link through a model.
 * @assistant hands: request_hands_on(billing)
 */
export async function createPortal(scope: HttpScope): Promise<BillingCheckout> {
  const res = await httpRequest(scope, "/v1/org/billing/portal", {
    method: "POST",
  });
  return (await res.json()) as BillingCheckout;
}

/** What the free-slot swap answered: done, or a state the caller is in. */
export type ClaimFreeSlotResult =
  | { kind: "claimed" }
  | { kind: ClaimFreeRefusal };

/**
 * The refusal behind a failed swap, or null for every other error. A code is
 * recognized only with the status the contract pairs it with.
 */
export function claimFreeSlotRefusal(error: unknown): ClaimFreeRefusal | null {
  if (!(error instanceof Error)) return null;
  const code = refusalCode(error);
  if (code === null || !Object.hasOwn(CLAIM_FREE_REFUSALS, code)) return null;
  const refusal = code as ClaimFreeRefusal;
  return CLAIM_FREE_REFUSALS[refusal] === refusalStatus(error) ? refusal : null;
}

/**
 * Makes the active organization the free one, in place of the organization that is free today.
 *
 * Billing owner only. The org turns free and unlocked, and in the same step
 * the owner's current free org, if any, locks until it is paid for. Answers
 * `has_subscription` for an org that still has a live subscription and
 * `not_billing_owner` for anyone who does not pay for it.
 * @assistant group:billing
 * @assistant confirm: money. The organization that is free today locks, and its members cannot send messages until it is paid for.
 */
export async function claimFreeSlot(
  scope: HttpScope,
): Promise<ClaimFreeSlotResult> {
  try {
    await httpRequest(scope, "/v1/org/billing/free", { method: "POST" });
    return { kind: "claimed" };
  } catch (err) {
    const refusal = claimFreeSlotRefusal(err);
    if (refusal) return { kind: refusal };
    throw err;
  }
}
