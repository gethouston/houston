import {
  type BugReportFailure,
  toBugReportFailure,
} from "./bug-report-failure.ts";

export type BugReportOutcome =
  | { delivered: "linear"; issueId: string | null }
  | { delivered: "fallback"; eventId: string }
  | { delivered: "none" };

export interface BugReportChannels {
  sendToIntake(): Promise<string | null>;
  sendFallback(failure: BugReportFailure): Promise<string>;
  reportIntakeFailure(failure: BugReportFailure, err: unknown): void;
  reportFallbackFailure(err: unknown): void;
}

export async function deliverBugReport(
  channels: BugReportChannels,
): Promise<BugReportOutcome> {
  let failure: BugReportFailure;
  try {
    return { delivered: "linear", issueId: await channels.sendToIntake() };
  } catch (err) {
    failure = toBugReportFailure(err);
    channels.reportIntakeFailure(failure, err);
  }
  try {
    const eventId = await channels.sendFallback(failure);
    if (eventId) return { delivered: "fallback", eventId };
  } catch (err) {
    channels.reportFallbackFailure(err);
  }
  return { delivered: "none" };
}
