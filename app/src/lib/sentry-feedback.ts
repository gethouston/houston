import * as Sentry from "@sentry/browser";
import { confirmDelivery } from "./sentry-delivery";

// The same bounds the Linear issue applies (bug_report/format.rs): the
// person's words keep their start, a log tail keeps its end (the failure is
// there). Unbounded, a huge paste or log could push the envelope past
// Sentry's size limit and the fallback would silently not land.
const MAX_MESSAGE_CHARS = 6_000;
const MAX_LOG_CHARS = 8_000;

const keepStart = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 3)}...`;

const keepEnd = (s: string, max: number): string =>
  s.length <= max ? s : `...\n${s.slice(s.length - (max - 4))}`;

/**
 * The bug report's fallback channel (H-009, HOUSTON-APP-5FT): a Sentry user
 * feedback whose message IS the person's words, with the same log tail the
 * Linear issue would have carried as attachments. It lands in Sentry's User
 * Feedback list, which is where we read reports while Linear refuses them.
 *
 * Answers the event id only once Sentry accepted it (`confirmDelivery`), else
 * "" (not initialized, offline, rate-limited): the caller tells the person
 * their report arrived only on a real id.
 */
export interface BugReportFeedback {
  /** The person's own words, or the diagnostic for a card's report pill. */
  message: string;
  email?: string | null;
  /** The report's triage tag (`manual_report`, a card's command). */
  command: string;
  /** Why the primary intake did not take it (`intake_unavailable`, `other`). */
  reason: string;
  /** Extra triage tags (a provider card's model, status, request id). */
  tags?: Record<string, string>;
  /** Context lines (app version, workspace) that ride as `extra`. */
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
        ...feedback.tags,
        source: feedback.command,
        bug_report_fallback: feedback.reason,
      },
    },
    { attachments, captureContext: { extra: feedback.context } },
  );
  return confirmDelivery(eventId);
}
