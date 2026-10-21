import type { PlanSummary } from "@houston/wire-types";
import { planOffer, planPriceAmounts } from "./billing-model";
import { formatLaunchMonthDay, formatPlanAmount } from "./format";

/** The per-person launch announcement is due: a Free person who has not dismissed it. */
export function planAnnouncementDue(plan: PlanSummary | undefined): boolean {
  return plan?.plan === "free" && plan.announcement;
}

export function planAnnouncementView(plan: PlanSummary, locale?: string) {
  const offer = planOffer(plan, locale);
  return {
    starts: plan.limitsStartAt
      ? formatLaunchMonthDay(plan.limitsStartAt, locale)
      : null,
    free: formatPlanAmount(0, plan.plus.price.currency, locale),
    plus: planPriceAmounts(plan, locale),
    offer,
    action: offer ? ("checkout" as const) : ("plans" as const),
  };
}

export function createPlanAnnouncementActions(actions: {
  dismiss: () => void;
  checkout: () => void;
  openPlans: () => void;
}) {
  let dismissed = false;
  const close = () => {
    if (dismissed) return;
    dismissed = true;
    actions.dismiss();
  };
  return {
    close,
    primary(action: "checkout" | "plans") {
      if (action === "checkout") actions.checkout();
      else {
        close();
        actions.openPlans();
      }
    },
  };
}
