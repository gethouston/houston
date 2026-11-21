import { type BugReportOutcome, deliverBugReport } from "./bug-report-delivery";
import { logAndReportError, reportError } from "./error-report";
import { osReadRecentLogs, osReportBug } from "./os-bridge";
import { reportQuietError } from "./quiet-error-report";
import { captureBugReportFeedback } from "./sentry-feedback";

export type { BugReportOutcome } from "./bug-report-delivery";

interface BugReportContext {
  command: string;
  error: string;
  spaceName?: string;
  workspaceName?: string;
  userEmail?: string | null;
  timestamp: string;
  appVersion: string;
  userMessage?: string;
}

async function getRecentLogs(
  lines = 50,
): Promise<{ backend: string; frontend: string }> {
  try {
    return await osReadRecentLogs(lines);
  } catch (err) {
    reportError(
      "read_recent_logs",
      err instanceof Error ? err.message : String(err),
      err,
    );
    return { backend: "(unavailable)", frontend: "(unavailable)" };
  }
}

export async function submitBugReport(
  context: BugReportContext,
): Promise<BugReportOutcome> {
  const logs = await getRecentLogs();
  const { command } = context;
  return deliverBugReport({
    sendToIntake: () => osReportBug({ ...context, logs }),
    sendFallback: (failure) =>
      captureBugReportFeedback({
        message: context.userMessage || context.error,
        email: context.userEmail,
        command,
        reason: failure.kind,
        context: {
          error: context.userMessage ? undefined : context.error,
          appVersion: context.appVersion,
          timestamp: context.timestamp,
          workspaceName: context.workspaceName,
          spaceName: context.spaceName,
          intakeFailure: failure.message,
        },
        logs,
      }),
    reportIntakeFailure: (failure, err) => {
      if (failure.kind === "intake_unavailable") {
        console.warn(
          `[${command}] bug intake unavailable, sending as feedback: ${failure.message}`,
        );
        reportQuietError(
          "bug_intake_unavailable",
          command,
          failure.message,
          err,
        );
        return;
      }
      logAndReportError(command, err);
    },
    reportFallbackFailure: (err) =>
      logAndReportError("bug_report_fallback", err),
  });
}
