import { useUIStore } from "../stores/ui";
import { analytics, classifyAnalyticsError } from "./analytics";
import i18n from "./i18n";
import { reportQuietError } from "./quiet-error-report";
import {
  captureException as sentryCapture,
  sentrySuppressedInDev,
} from "./sentry";
import { createSentryReportError } from "./sentry-report-error";
import { isUpdateNetworkFailure } from "./update-download-failure";

export function showUpdateCheckStuckToast(
  message: string,
  consecutiveFailures: number,
  currentVersion: string,
): void {
  const command = "update_check";
  console.error(
    `[toast:${command}] ${consecutiveFailures} consecutive check failures: ${message}`,
  );
  useUIStore.getState().addToast({
    title: i18n.t("shell:errorToast.updateStuckTitle"),
    description: i18n.t("shell:errorToast.updateStuckDescription"),
    variant: "info",
  });
  analytics.track("update_check_failed", {
    source: command,
    consecutive_failures: consecutiveFailures,
    from_version: currentVersion,
    error_kind: classifyAnalyticsError(message),
  });
  if (sentrySuppressedInDev) return;
  if (isUpdateNetworkFailure(message)) {
    reportQuietError("offline", command, message, new Error(message));
    return;
  }
  void sentryCapture(createSentryReportError(command, message), {
    source: command,
    error_kind: classifyAnalyticsError(message),
  }).catch((flushErr: unknown) => {
    console.error("[sentry] failed to flush captured error", flushErr);
  });
}
