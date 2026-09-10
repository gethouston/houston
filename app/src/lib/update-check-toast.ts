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

/**
 * Surface a client whose update checks keep failing (PRODUCT-1386). The
 * forced updater is fail-open — a check failure only console.warns — so a
 * client that can NEVER reach the release feed (a proxy or region block
 * between it and GitHub) would strand on an old build invisibly, with no
 * server-side floor to catch it since the 426 gate was retired
 * (PRODUCT-1144). The checker calls this once per failure streak, after
 * `UPDATE_CHECK_STUCK_THRESHOLD` consecutive failures:
 *  - one informational toast pointing at the manual download, so the user
 *    can act;
 *  - a dedicated `update_check_failed` analytics event (its own name, not
 *    `app_error_shown`, so a fleet-staleness dashboard can count stuck
 *    clients directly);
 *  - a Sentry capture, so stranded clients get an issue with a user count —
 *    this also surfaces any leaked staging QA build, whose no-op updater
 *    endpoint 404s every check by design. A network-shaped failure (the
 *    request never got an answer: offline, DNS, a proxy that drops GitHub)
 *    is the quiet `offline` class instead (PRODUCT-1727): the toast and the
 *    analytics event still fire, but Sentry gets one burst-collapsed warning
 *    in the class's fingerprinted issue, never a per-user error.
 */
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
