import { useUIStore } from "../stores/ui";
import i18n from "./i18n";

/**
 * The plan's copy for a routine save refused under the saver's plan floor
 * (`400 plan_min_interval`), naming the refusal's own floor: an info toast,
 * the whole surface of an expected business state. Never the red bug pair
 * and never Sentry; shown by whichever error layer meets the refusal first.
 * It names no Plus: Plus pays only for the person's own org, and the floor
 * may be any org's.
 */
export function showPlanFloorToast(minutes: number): void {
  useUIStore.getState().addToast({
    title: i18n.t("plan:shortInterval", { minutes }),
    description: i18n.t("plan:shortIntervalBody"),
    variant: "info",
  });
}
