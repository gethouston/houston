import type { BillingSummary } from "@houston-ai/engine-client";
import { daysLeftUntil } from "../../lib/team-status-model.ts";

/**
 * Pure, DOM-free presentation logic for the C8 Billing tab. Kept out of the
 * `.tsx` so the "checkout vs manage" decision and the trial countdown unit-test
 * under bare Node.
 */

/**
 * Does the team hold a live Stripe subscription? A subscribed team manages its
 * plan (card, invoices, interval, cancel) through the customer PORTAL; an
 * unsubscribed one (free / trialing / expired with no card) upgrades through
 * CHECKOUT. `active`/`past_due` are always subscribed; a set `interval` proves a
 * subscription even if a stale `status` says otherwise.
 */
export function isSubscribed(billing: BillingSummary): boolean {
  return (
    billing.status === "active" ||
    billing.status === "past_due" ||
    billing.interval != null
  );
}

/**
 * The primary billing action available to the caller on this team:
 * - `none` for a non-owner (admins see billing read-only and are told to ask
 *   the owner — C8 admin degrade asymmetry; only the owner can check out/manage);
 * - `portal` when subscribed (Manage billing → Stripe customer portal);
 * - `checkout` otherwise (any non-`active` status, per C8 — start a subscription).
 */
export type BillingAction = "none" | "checkout" | "portal";

export function billingAction(
  billing: BillingSummary,
  isOwner: boolean,
): BillingAction {
  if (!isOwner) return "none";
  return isSubscribed(billing) ? "portal" : "checkout";
}

/**
 * Days left in the trial for the tab's status line, or null when the team is not
 * trialing (or carries no trial clock). Delegates to the UTC-safe helper so the
 * tab and the countdown pill agree to the day.
 */
export function trialDaysLeft(
  billing: BillingSummary,
  now: Date,
): number | null {
  if (billing.status !== "trialing" || !billing.trialEndsAt) return null;
  return daysLeftUntil(billing.trialEndsAt, now);
}
