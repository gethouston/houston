import { useUIStore } from "../stores/ui";
import i18n from "./i18n";

export function showWebhookNotCreatorToast(): void {
  useUIStore.getState().addToast({
    title: i18n.t("routines:webhook.creatorOnlyTitle"),
    description: i18n.t("routines:webhook.creatorOnlyBody"),
    variant: "info",
  });
}
