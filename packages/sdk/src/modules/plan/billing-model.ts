import type { PlanSummary, PlusInvoice } from "@houston/wire-types";
import { formatLaunchDate, formatPlanAmount } from "./format";

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

export function planOffer(
  plan: PlanSummary,
  locale?: string,
  now = Date.now(),
) {
  const offer = plan.plan === "free" ? plan.plus.offer : undefined;
  if (!offer || Date.parse(offer.endsAt) <= now) return null;
  return {
    amount: formatPlanAmount(offer.amount, offer.currency, locale),
    from: formatLaunchDate(offer.coversFrom, locale),
    until: formatLaunchDate(offer.coversUntil, locale),
    ends: formatLaunchDate(offer.endsAt, locale),
  };
}
