import { useUIStore } from "../stores/ui";
import { genericErrorDescription } from "./error-report";
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";
import { logger } from "./logger";
import { osOpenUrl } from "./os-bridge";
import { blocksPurchaseUrl } from "./purchase-policy";
import { planUrlOpenFailure } from "./url-open-failure";

export interface OpenExternalUrlOptions {
  failedTitle?: string;
  command?: string;
}

export async function openExternalUrl(
  url: string,
  options: OpenExternalUrlOptions = {},
): Promise<boolean> {
  if (blocksPurchaseUrl(url)) {
    showExpectedStateToast(
      i18n.t("plan:native.purchaseLinkTitle"),
      i18n.t("plan:managedOnWeb"),
    );
    return false;
  }
  try {
    return await osOpenUrl(url);
  } catch (err) {
    const plan = planUrlOpenFailure(err);
    logger.error(`[open-url] ${plan.failure.kind}: ${plan.failure.message}`);
    if (plan.surface === "expected") {
      showExpectedStateToast(
        i18n.t("shell:openUrl.noBrowserTitle"),
        i18n.t(`shell:openUrl.${plan.copy}`),
      );
      return false;
    }
    useUIStore.getState().addToast({
      variant: "error",
      title: options.failedTitle ?? i18n.t("shell:openUrl.failedTitle"),
      description: genericErrorDescription(options.command ?? "open_url", err),
    });
    return false;
  }
}
