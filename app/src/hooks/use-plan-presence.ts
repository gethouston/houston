import { useEffect } from "react";
import { logAndReportError } from "../lib/error-report";
import { markPlanPresence, planPresenceDue } from "../lib/plan-session";
import { tauriOrg } from "../lib/tauri";

/**
 * Tell the gateway the person is here in the active org (at most once per
 * presence window per org) whenever the app becomes visible or focused, on a
 * deployment with plans. The request rides the active org's header, so it
 * waits until that org is known.
 */
export function usePlanPresence(
  enabled: boolean,
  orgSlug: string | null,
): void {
  useEffect(() => {
    if (!enabled || !orgSlug) return;
    const report = () => {
      if (
        document.visibilityState !== "visible" ||
        !planPresenceDue(orgSlug, Date.now())
      )
        return;
      markPlanPresence(orgSlug, Date.now());
      void tauriOrg
        .reportPresence()
        .catch((error: unknown) => logAndReportError("report_presence", error));
    };
    report();
    document.addEventListener("visibilitychange", report);
    window.addEventListener("focus", report);
    return () => {
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("focus", report);
    };
  }, [enabled, orgSlug]);
}
