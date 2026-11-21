import type { OrgBilling } from "@houston/engine-adapter";
import { orgRecovery } from "@houston/sdk";

export const BILLING_CURRENCY = "usd";

export type BillingTabAction = "checkout" | "portal" | "web" | "ask_owner";

export function billingAction(
  billing: OrgBilling,
  purchasable: boolean,
): BillingTabAction {
  if (!billing.isBillingOwner) return "ask_owner";
  if (!purchasable) return "web";
  if (billing.tier === "free") return "checkout";
  return orgRecovery(billing, "owner", null).includes("checkout")
    ? "checkout"
    : "portal";
}

export type BillingTabStatus = "free" | "paid" | "past_due" | "locked";

export function billingStatus(billing: OrgBilling): BillingTabStatus {
  if (billing.status === "active") return billing.tier;
  return billing.status;
}

export function scheduledLock(billing: OrgBilling, now: number): string | null {
  if (billing.status === "locked" || !billing.lockAt) return null;
  return Date.parse(billing.lockAt) > now ? billing.lockAt : null;
}
