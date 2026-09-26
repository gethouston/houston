import type { PlanSummary } from "@houston/wire-types";
import { planOffer, planPriceAmounts } from "./billing-model";
import { formatLaunchMonthDay, formatPlanAmount } from "./format";

export function planAnnouncementView(
  plan: PlanSummary,
  locale?: string,
  now = Date.now(),
) {
  const offer = planOffer(plan, locale, now);
  return {
    starts: plan.limitsStartAt
      ? formatLaunchMonthDay(plan.limitsStartAt, locale)
      : null,
    free: formatPlanAmount(0, plan.plus.price.currency, locale),
    plus: planPriceAmounts(plan, locale),
    offer:
      offer && plan.plus.offer
        ? {
            ...offer,
            from: formatLaunchMonthDay(plan.plus.offer.coversFrom, locale),
            until: formatLaunchMonthDay(plan.plus.offer.coversUntil, locale),
          }
        : null,
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
