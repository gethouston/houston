import * as Sentry from "@sentry/browser";
import { confirmDelivery } from "./sentry-delivery";

const MAX_MESSAGE_CHARS = 6_000;
const MAX_LOG_CHARS = 8_000;

const keepStart = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 3)}...`;

const keepEnd = (s: string, max: number): string =>
  s.length <= max ? s : `...\n${s.slice(s.length - (max - 4))}`;

export interface BugReportFeedback {
  message: string;
  email?: string | null;
  command: string;
  reason: string;
  context: Record<string, string | undefined>;
  logs: { backend: string; frontend: string };
}

export async function captureBugReportFeedback(
  feedback: BugReportFeedback,
): Promise<string> {
  if (!Sentry.isInitialized()) return "";
  const attachments = [
    {
      filename: "backend.log",
      data: keepEnd(feedback.logs.backend, MAX_LOG_CHARS),
    },
    {
      filename: "frontend.log",
      data: keepEnd(feedback.logs.frontend, MAX_LOG_CHARS),
    },
  ].filter((a) => a.data.length > 0);
  const eventId = Sentry.captureFeedback(
    {
      message: keepStart(feedback.message, MAX_MESSAGE_CHARS),
      email: feedback.email ?? undefined,
      source: "bug_report",
      tags: {
        source: feedback.command,
        bug_report_fallback: feedback.reason,
      },
    },
    { attachments, captureContext: { extra: feedback.context } },
  );
  return confirmDelivery(eventId);
}
