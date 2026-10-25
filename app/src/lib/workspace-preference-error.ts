import { workspacePreferenceErrorKind } from "@houston/sdk";
import { analytics } from "./analytics";
import { classifyAnalyticsError } from "./analytics-error-kind";
import { describeError } from "./describe-error";
import { logAndReportError } from "./error-report";
import { isNeedsUpgradeError } from "./team-status-model";

const reported = new Set<string>();

/** Boot and deliberate switches report once; connectivity never files a Sentry issue. */
export function reportWorkspacePreferenceError(
  operation: "read" | "write" | "device",
  error: unknown,
): void {
  const kind = workspacePreferenceErrorKind(error);
  if (kind === "signed_out" || kind === "identity_changed") return;
  const description = describeError(error);
  const signature = `${operation}:${description}`;
  if (reported.has(signature)) return;
  reported.add(signature);
  const label = `workspace_preference_${operation}`;
  analytics.track("app_error_shown", {
    source: label,
    error_kind: classifyAnalyticsError(description),
  });
  if (isNeedsUpgradeError(error) || kind === "connectivity") {
    console.warn(`[${label}] ${description}`);
    return;
  }
  logAndReportError(label, error);
}
