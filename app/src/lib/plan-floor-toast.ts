import { useUIStore } from "../stores/ui";
import i18n from "./i18n";

export function showPlanFloorToast(minutes: number): void {
  useUIStore.getState().addToast({
    title: i18n.t("plan:shortInterval", { minutes }),
    description: i18n.t("plan:shortIntervalBody"),
    variant: "info",
  });
}
