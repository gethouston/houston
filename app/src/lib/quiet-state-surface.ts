import { firstDayAccountBlocked } from "@houston/sdk/agents/first-day-refusal";
import { useUIStore } from "../stores/ui";
import { analytics, classifyAnalyticsError } from "./analytics";
import { showFirstDayNoProviderToast } from "./first-day-no-provider-toast";
import i18n from "./i18n";
import { surfacePlanMinInterval } from "./plan-min-interval";
import { providerName } from "./providers";
import type { QuietErrorClass } from "./quiet-error-class";
import { reportQuietError } from "./quiet-error-report";
import { surfaceRoutineGone } from "./routine-gone-surface";
import { showWebhookNotCreatorToast } from "./webhook-not-creator-toast";

export function surfaceQuietState(
  quiet: QuietErrorClass,
  command: string,
  message: string,
  originalError: unknown,
): boolean {
  switch (quiet) {
    case "bridge_unsupported":
    case "bridge_no_agent":
    case "bridge_state":
      console.error(`[toast:${command}] ${message}`);
      reportQuietError(quiet, command, message, originalError);
      return true;
    case "plan_min_interval":
      return surfacePlanMinInterval(originalError);
    case "webhook_not_creator":
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
      console.info(`[toast:${command}] ${message}`);
      showFirstDayNoProviderToast(originalError);
      return true;
    case "first_day_provider_unavailable":
      console.warn(`[toast:${command}] ${message}`);
      reportQuietError(quiet, command, message, originalError);
      useUIStore.getState().addToast({
        title: i18n.t("board:firstDay.providerUnavailable.title"),
        description: i18n.t("board:firstDay.providerUnavailable.body"),
        variant: "info",
      });
      return true;
    case "first_day_account_blocked": {
      console.info(`[toast:${command}] ${message}`);
      const provider = firstDayAccountBlocked(originalError)?.provider;
      const name = provider ? providerName(provider) : null;
      useUIStore.getState().addToast({
        title: name
          ? i18n.t("board:firstDay.accountBlocked.title", { provider: name })
          : i18n.t("board:firstDay.accountBlocked.titleAny"),
        description: name
          ? i18n.t("board:firstDay.accountBlocked.body", { provider: name })
          : i18n.t("board:firstDay.accountBlocked.bodyAny"),
        variant: "info",
      });
      return true;
    }
    case "no_url_handler":
      console.error(`[toast:${command}] ${message}`);
      reportQuietError("no_url_handler", command, message, originalError);
      useUIStore.getState().addToast({
        title: i18n.t("shell:openUrl.noBrowserTitle"),
        description: i18n.t("shell:openUrl.noBrowser"),
        variant: "info",
      });
      return true;
    case "upload_interrupted": {
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
