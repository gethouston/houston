import { providerErrorReportLine } from "@houston/sdk/turns/provider-error-report";
import { type BugReportOutcome, deliverBugReport } from "./bug-report-delivery";
import { logAndReportError, reportError } from "./error-report";
import { osReadRecentLogs, osReportBug } from "./os-bridge";
import { reportQuietError } from "./quiet-error-report";
import { captureBugReportFeedback } from "./sentry-feedback";

export type { BugReportOutcome } from "./bug-report-delivery";

interface BugReportContext {
  /** Flat snake_case triage tag (`manual_report`, a card's command). */
  command: string;
  /** The diagnostic; for a person's own report, their words again. */
  error: string;
  spaceName?: string;
  workspaceName?: string;
  userEmail?: string | null;
  timestamp: string;
  appVersion: string;
  /** Free-text the person typed (Settings > Report bug). Linear titles and
   *  leads the issue with it, and the fallback feedback's message is it. */
  userMessage?: string;
  /** Triage tags (a provider card's facts, `providerErrorReportTags`). They
   *  ride the intake payload and the fallback feedback as tags, and the
   *  intake's issue body as one plain line after the error. */
  tags?: Record<string, string>;
}

async function getRecentLogs(
  lines = 50,
): Promise<{ backend: string; frontend: string }> {
  try {
    return await osReadRecentLogs(lines);
  } catch (err) {
    // The report still goes, saying its logs are missing; why they are
    // missing reaches us on its own.
    reportError(
      "read_recent_logs",
      err instanceof Error ? err.message : String(err),
      err,
    );
    return { backend: "(unavailable)", frontend: "(unavailable)" };
  }
}

/**
 * The ONE way a surface sends a bug report (Settings > Report bug, every
 * card's report pill). Linear first, Sentry user feedback when Linear refuses
 * (`deliverBugReport`), so a report is only lost when every channel failed.
 * The refusal is reported here, once: a surface never reports it again.
 */
export async function submitBugReport(
  context: BugReportContext,
): Promise<BugReportOutcome> {
  const logs = await getRecentLogs();
  const { command, tags } = context;
  // Tags never show on the intake's issue, and the gateway's `/feedback`
  // drops fields it does not know, so the facts also ride the error text the
  // issue body prints on both desktop and web.
  const line = tags ? providerErrorReportLine(tags) : "";
  const error = line ? `${context.error}\n\n${line}` : context.error;
  return deliverBugReport({
    sendToIntake: () => osReportBug({ ...context, error, logs }),
    sendFallback: (failure) =>
      captureBugReportFeedback({
        message: context.userMessage || context.error,
        email: context.userEmail,
        command,
        reason: failure.kind,
        tags,
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
        // Our side (Linear's plan cap, HOUSTON-APP-5FT): one fingerprinted
        // warning per burst; the fallback feedback carries the report itself.
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
