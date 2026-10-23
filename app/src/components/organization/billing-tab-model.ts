import type { OrgBilling } from "@houston/engine-adapter";
import { orgRecovery } from "@houston/sdk";

/**
 * Pure, DOM-free presentation logic for an org's Billing tab, read off the
 * org's `OrgBilling` (every member can read it; the tab shows it to owners
 * and admins). Kept out of the `.tsx` so the button and the status line
 * unit-test under bare Node. What the org costs is the SDK's
 * (`orgBillingPrice`).
 */

/** `OrgBilling` carries cents only; the gateway bills every org in US dollars. */
export const BILLING_CURRENCY = "usd";

/**
 * What the tab offers the caller:
 * - `ask_owner` for anyone who does not pay (other owners, admins): they see
 *   the state and seats, and who to ask;
 * - `web` for the billing owner inside a store app, which never sells
 *   (`purchase-policy`): billing is managed on the website, said as plain text;
 * - `checkout` for a free org, and for any org the SDK's `orgRecovery` sends
 *   back to checkout (a paid org whose subscription ended);
 * - `portal` for a paid org, which still has its subscription (card,
 *   invoices, a failed payment, cancel).
 */
export type BillingTabAction = "checkout" | "portal" | "web" | "ask_owner";

export function billingAction(
  billing: OrgBilling,
  purchasable: boolean,
): BillingTabAction {
  if (!billing.isBillingOwner) return "ask_owner";
  if (!purchasable) return "web";
  if (billing.tier === "free") return "checkout";
  // The role only decides `move_out`; the billing owner's way back is the
  // same for every role.
  return orgRecovery(billing, "owner", null).includes("checkout")
    ? "checkout"
    : "portal";
}

/** The tab's headline: the plan, unless a payment problem or a lock outranks it. */
export type BillingTabStatus = "free" | "paid" | "past_due" | "locked";

export function billingStatus(billing: OrgBilling): BillingTabStatus {
  if (billing.status === "active") return billing.tier;
  return billing.status;
}

/** A lock the gateway has scheduled but not reached yet, else null. */
export function scheduledLock(billing: OrgBilling, now: number): string | null {
  if (billing.status === "locked" || !billing.lockAt) return null;
  return Date.parse(billing.lockAt) > now ? billing.lockAt : null;
}
