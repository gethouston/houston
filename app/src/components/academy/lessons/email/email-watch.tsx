import { useEffect, useRef } from "react";
import { useSettledConversations } from "../../../../hooks/queries/use-settled-conversations";
import { useAcademyProgress } from "../../../../hooks/use-academy-progress";
import { useConversationFeed } from "../../../../hooks/use-conversation-vm";
import { emailSentVia } from "../../../../lib/academy/email-lesson/email-sent";
import { emailTask } from "../../../../lib/academy/email-lesson/email-task";
import { firstEmailCounts } from "../../../../lib/academy/email-lesson/first-email";
import { analytics } from "../../../../lib/analytics";
import type { LessonCompanionProps } from "../lesson-companion";
import { EMPLOYEE_EMAIL_LESSON_ID } from "../registry";
import { useEmailLessonStore } from "./email-lesson-store";

/**
 * The watch beat's companion: it reads the task the user just sent and ends
 * the lesson the moment the conversation shows the email going out, counting
 * a first email for the funnel (never a replay's). The user's "I got it"
 * ends it just the same, and a run resumed after a restart, which no longer
 * knows the task, waits on that press alone.
 */
export function EmailWatchCompanion({ onNext }: LessonCompanionProps) {
  const ask = useEmailLessonStore((s) => s.ask);
  const { rows } = useSettledConversations();
  const task = ask === null ? null : emailTask(rows, ask);
  const feed = useConversationFeed(task?.agent_path, task?.session_key);
  const via = task === null ? null : emailSentVia(feed);
  const { record, isError, loading } = useAcademyProgress();
  const seen = useRef(false);

  useEffect(() => {
    // The record decides whether this email is a first; it is read first.
    if (via === null || seen.current || loading) return;
    seen.current = true;
    if (firstEmailCounts({ record, isError }, EMPLOYEE_EMAIL_LESSON_ID))
      analytics.track("first_email_sent", { provider: via });
    onNext();
  }, [via, record, isError, loading, onNext]);

  return null;
}
