import type { PlanSummary, PlusInvoice } from "@houston/wire-types";
import { formatPlanAmount } from "./format";

/**
 * The per-person summary's usage, for the settings Plan screen alone; every
 * other surface reads the active org's pool (`../billing/model`).
 */
export function planSummaryPercent(
  plan: PlanSummary | undefined,
): number | null {
  if (plan?.plan !== "free" || !plan.usage) return null;
  return Math.min(100, Math.max(0, Math.floor(plan.usage.percent)));
}

export function planUsageMode(
  plan: PlanSummary | undefined,
  now = Date.now(),
): "none" | "preview" | "current" {
  if (planSummaryPercent(plan) === null) return "none";
  return plan?.limitsStartAt && Date.parse(plan.limitsStartAt) > now
    ? "preview"
    : "current";
}

export interface BillingCards {
  upgrade: boolean;
  usage: boolean;
  manage: boolean;
  renewal: "none" | "renews" | "ends" | "paymentIssue";
  routine: "kept" | "choose" | "paused";
}

export function billingCards(plan: PlanSummary): BillingCards {
  const free = plan.plan === "free";
  return {
    upgrade: free,
    usage: free,
    manage: plan.plus.manageable,
    renewal:
      plan.plus.status === "past_due"
        ? "paymentIssue"
        : !plan.plus.renewsAt
          ? "none"
          : plan.plus.cancelAtPeriodEnd
            ? "ends"
            : "renews",
    routine: plan.routines?.paused
      ? "paused"
      : (plan.routines?.limitedCount ?? 0) > 0
        ? "choose"
        : "kept",
  };
}

export function invoiceStatusKey(
  status: PlusInvoice["status"],
): "draft" | "open" | "paid" | "uncollectible" | "void" {
  return status;
}

export function planPriceAmounts(plan: PlanSummary, locale?: string) {
  const { amount, currency, compareAt } = plan.plus.price;
  return {
    current: formatPlanAmount(amount, currency, locale),
    compareAt:
      compareAt === undefined
        ? null
        : formatPlanAmount(compareAt, currency, locale),
  };
}

/** The beta tester gift as display values, or null when the person has none. */
export function planOffer(plan: PlanSummary, locale?: string) {
  const offer = plan.plan === "free" ? plan.plus.offer : undefined;
  if (!offer) return null;
  return { amount: formatPlanAmount(offer.amount, offer.currency, locale) };
}
