import { useUIStore } from "../stores/ui";
import { genericErrorDescription } from "./error-report";
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";
import { logger } from "./logger";
import { osOpenUrl } from "./os-bridge";
import { planUrlOpenFailure } from "./url-open-failure";

export interface OpenExternalUrlOptions {
  /** Authored title for the error toast when the open fails for a reason we
   *  do not recognise; defaults to the generic "that link didn't open". */
  failedTitle?: string;
  /** Sentry triage tag for an unrecognised failure. */
  command?: string;
}

/**
 * Open a URL in the user's default browser and NEVER reject: the outcome is
 * the boolean (`false` = the browser did not take the URL) and a failure is
 * surfaced here, once, so a fire-and-forget caller can never leak an
 * unhandled rejection (HOUSTON-APP-5ES: 25 call sites did).
 *
 * A machine with no default browser (`no_handler`) is a state only the user
 * can fix, in the OS settings, so it reads as informational copy with no
 * report. Everything else is a red toast that reports. The raw diagnostic
 * always reaches the frontend log.
 *
 * Flows that decide on the failure themselves (the identity sign-ins, which
 * fail an attempt fast when the browser never opens) call `osOpenUrl`
 * directly and keep the rejection.
 */
export async function openExternalUrl(
  url: string,
  options: OpenExternalUrlOptions = {},
): Promise<boolean> {
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
