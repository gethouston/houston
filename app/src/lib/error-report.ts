import { isAgentWarmingRefusal } from "./agent-warming-refusal";
import { classifyAnalyticsError } from "./analytics";
import { describeError } from "./describe-error";
import i18n from "./i18n";
import { classifyQuietError } from "./quiet-error-class";
import { reportQuietError } from "./quiet-error-report";
import { captureException as sentryCapture } from "./sentry";
import { createSentryReportError } from "./sentry-report-error";
import {
  markReportedToSentry,
  wasReportedToSentry,
} from "./sentry-reported-mark";

export interface ReportDetail {
  tags?: Record<string, string>;
  fingerprint?: string[];
}

export function reportError(
  command: string,
  message: string,
  originalError?: unknown,
  detail?: ReportDetail,
): void {
  if (isAgentWarmingRefusal(originalError)) {
    console.debug(`[report:${command}] write blocked while the agent warms up`);
    return;
  }
  const quiet = classifyQuietError(originalError);
  if (quiet === "plan_min_interval") {
    console.debug(`[report:${command}] refused under the plan's routine floor`);
    return;
  }
  if (quiet === "webhook_not_creator") {
    console.debug(`[report:${command}] refused: not the routine's creator`);
    return;
  }
  if (quiet === "first_day_no_provider") {
    console.debug(`[report:${command}] refused: no AI connected`);
    return;
  }
  if (quiet) {
    reportQuietError(quiet, command, message, originalError);
    return;
  }
  markReportedToSentry(originalError);
  const error = createSentryReportError(command, message, originalError);
  void sentryCapture(
    error,
    {
      ...detail?.tags,
      source: command,
      error_kind: classifyAnalyticsError(message),
    },
    undefined,
    detail?.fingerprint,
  ).catch((flushErr: unknown) => {
    console.error("[sentry] failed to flush captured error", flushErr);
  });
}

export function logAndReportError(
  command: string,
  err: unknown,
  detail?: ReportDetail,
): void {
  const raw = describeError(err);
  console.error(`[${command}] ${raw}`);
  if (wasReportedToSentry(err)) return;
  reportError(command, raw, err, detail);
}

export function genericErrorDescription(command: string, err: unknown): string {
  logAndReportError(command, err);
  return i18n.t("shell:errorToast.genericDescription");
}
