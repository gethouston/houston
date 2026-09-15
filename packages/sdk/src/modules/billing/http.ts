/**
 * The billing REST calls, over the injected `fetch`.
 *
 * These are HOSTED-GATEWAY routes: a subscription belongs to the managed
 * cloud's team spaces, so no host serves them and the runtime client has no
 * surface for them. They go straight through {@link httpRequest} with literal
 * paths, which is also what keeps them visible to the assistant's operation
 * catalog.
 *
 * Nothing here degrades. A non-2xx throws a `BillingHttpError` (`index.ts`)
 * carrying the HTTP `status`, and a surface that wants a softer answer (the web
 * adapter's "no billing to show" on a gateway with no Stripe) decides that for
 * itself on the status. A `401` additionally fires `onUnauthorized`, so a lapsed
 * session token becomes a visible `tokenExpired` signal.
 */

import { type HttpScope, httpRequest } from "../http";
import type { BillingSummary } from "../spaces/types";
import type { BillingCheckout } from "./types";

/**
 * Shows the plan, trial, and payment status of the team workspace.
 *
 * The active team's billing summary. Throws on every failure, the NOT-ENTITLED
 * trio included — a gateway that predates billing (404), a caller it refuses
 * billing detail (403 `personal_space` or plain member), and a billing-off
 * deployment (503 `billing not configured`: no `GW_STRIPE_*` set — every prod
 * gateway with no Stripe, and the kind loop, run this way). It is the SURFACE
 * that reads those three as "nothing to show": the web adapter resolves them to
 * `null` so the billing UI renders nothing and the degrade surfaces take over,
 * which is what keeps the 503 from firing the red bug toast on team entry
 * (HOU-904).
 * @assistant group:billing
 */
export async function getBilling(scope: HttpScope): Promise<BillingSummary> {
  const res = await httpRequest(scope, "/v1/org/billing");
  return (await res.json()) as BillingSummary;
}

/**
 * Starts the checkout that subscribes the team workspace to a paid plan.
 *
 * Start a Stripe Checkout session for the active team (owner only; admin gets
 * 403 `not_owner`). Returns the hosted `{url}`. Never degrades — a failure throws
 * so the UI surfaces the real reason.
 * @assistant group:billing
 * @assistant confirm: money. It starts a real subscription, and the card it charges is the user's own.
 */
export async function createCheckout(
  scope: HttpScope,
  interval: "monthly" | "annual",
): Promise<BillingCheckout> {
  const res = await httpRequest(scope, "/v1/org/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ interval }),
  });
  return (await res.json()) as BillingCheckout;
}

/**
 * Opens the billing page where the user can change the card, see invoices, or cancel.
 *
 * Open the Stripe customer portal for the active team (owner only) — card,
 * invoices, interval switch, cancel. Returns the hosted `{url}`. Never degrades.
 * @assistant group:billing hidden: answers with a live Stripe portal session URL, which is a signed-in billing session for anyone who holds it; the person opens billing from the app instead of being handed a link through a model.
 * @assistant hands: request_hands_on(billing)
 */
export async function createPortal(scope: HttpScope): Promise<BillingCheckout> {
  const res = await httpRequest(scope, "/v1/org/billing/portal", {
    method: "POST",
  });
  return (await res.json()) as BillingCheckout;
}
