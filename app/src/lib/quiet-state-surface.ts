import { useUIStore } from "../stores/ui";
import { analytics, classifyAnalyticsError } from "./analytics";
import { showFirstDayNoProviderToast } from "./first-day-no-provider-toast";
import i18n from "./i18n";
import { surfacePlanMinInterval } from "./plan-min-interval";
import type { QuietErrorClass } from "./quiet-error-class";
import { reportQuietError } from "./quiet-error-report";
import { surfaceRoutineGone } from "./routine-gone-surface";
import { showWebhookNotCreatorToast } from "./webhook-not-creator-toast";

/**
 * The quiet classes (PRODUCT-1735) `showErrorToast` hands off besides offline
 * and waking, which keep their deduped toasts in `error-toast.ts`. Each keeps
 * its own surface and its ONE fingerprinted warning, or no report at all for
 * a business state. False for a class this does not own: the failure then
 * takes the toast layer's normal report path. Split out of `error-toast.ts`
 * to keep that module small.
 */
export function surfaceQuietState(
  quiet: QuietErrorClass,
  command: string,
  message: string,
  originalError: unknown,
): boolean {
  switch (quiet) {
    // PRODUCT-1833: the bridge classes have an inline surface already.
    case "bridge_unsupported":
    case "bridge_no_agent":
    case "bridge_state":
      console.error(`[toast:${command}] ${message}`);
      reportQuietError(quiet, command, message, originalError);
      return true;
    case "plan_min_interval":
      // A business state: the plan's copy naming the refusal's floor, and
      // nothing to report.
      return surfacePlanMinInterval(originalError);
    case "webhook_not_creator":
      // A business state: only the routine's creator may mint its address,
      // and the chip's own line says so. Nothing to report.
      showWebhookNotCreatorToast();
      return true;
    case "routine_gone":
      return surfaceRoutineGone(
        command,
        message,
        originalError,
        reportQuietError,
      );
    case "first_day_no_provider":
      // A business state: the first day waits for a connected AI. The raw
      // reason stays in the log line; nothing to report.
      console.info(`[toast:${command}] ${message}`);
      showFirstDayNoProviderToast(originalError);
      return true;
    case "no_url_handler":
      // Same remedy copy `openExternalUrl` shows; a rejection that reached
      // this surface skipped that seam (a raw `osOpenUrl` caller).
      console.error(`[toast:${command}] ${message}`);
      reportQuietError("no_url_handler", command, message, originalError);
      useUIStore.getState().addToast({
        title: i18n.t("shell:openUrl.noBrowserTitle"),
        description: i18n.t("shell:openUrl.noBrowser"),
        variant: "info",
      });
      return true;
    case "upload_interrupted": {
      // The person's own upload: copy naming it, never the offline notice,
      // and its own fingerprint so a cut upload is never a network drop. No
      // burst gate: each upload is one action (its batch loop stops at the
      // first failure), and `showSendFailedToast` relies on this toast
      // showing every time, so a quick retry is never left silent.
      console.error(`[toast:${command}] ${message}`);
      reportQuietError("upload_interrupted", command, message, originalError);
      analytics.track("app_error_shown", {
        source: command,
        error_kind: classifyAnalyticsError(message),
      });
      useUIStore.getState().addToast({
        title: i18n.t("shell:errorToast.uploadInterruptedTitle"),
        description: i18n.t("shell:errorToast.uploadInterruptedDescription"),
        variant: "info",
      });
      return true;
    }
    case "compute_busy":
    case "conversation_edit_refused": {
      console.error(`[toast:${command}] ${message}`);
      reportQuietError(quiet, command, message, originalError);
      analytics.track("app_error_shown", {
        source: command,
        error_kind: classifyAnalyticsError(message),
      });
      const copy =
        quiet === "compute_busy"
          ? ({
              title: "shell:errorToast.computeBusyTitle",
              description: "shell:errorToast.computeBusyDescription",
            } as const)
          : ({
              title: "shell:errorToast.conversationEditRefusedTitle",
              description:
                "shell:errorToast.conversationEditRefusedDescription",
            } as const);
      useUIStore.getState().addToast({
        title: i18n.t(copy.title),
        description: i18n.t(copy.description),
        variant: "info",
      });
      return true;
    }
    default:
      return false;
  }
}
