import { useUIStore } from "../stores/ui";
import i18n from "./i18n";
import { canPurchaseInApp } from "./purchase-policy";

/**
 * The plan's copy for a routine save refused under the saver's plan floor
 * (`400 plan_min_interval`), naming the refusal's own floor: an info toast,
 * the whole surface of an expected business state. Never the red bug pair
 * and never Sentry; shown by whichever error layer meets the refusal first.
 * The store apps never sell, so there it does not point to Plus.
 */
export function showPlanFloorToast(minutes: number): void {
  useUIStore.getState().addToast({
    title: i18n.t("plan:shortInterval", { minutes }),
    description: canPurchaseInApp()
      ? i18n.t("plan:shortIntervalBody")
      : i18n.t("plan:native.shortIntervalBody"),
    variant: "info",
  });
}
