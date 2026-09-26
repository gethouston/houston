import { formatLocalDateTime, messageLimitRefusal } from "@houston/sdk";
import i18n from "./i18n";

/**
 * Expected business state, not a bug: a Free person at the weekly limit
 * started a turn outside the composer (a routine's Run now, a mission start),
 * and the gateway answered C19 `429 message_limit`. Shows the plan's authored
 * limit copy as a plain info toast, never the red bug pair and never Sentry.
 * True when the error was this refusal and has been surfaced.
 */
export async function surfacePlanMessageLimit(err: unknown): Promise<boolean> {
  const refusal = messageLimitRefusal(err);
  if (!refusal) return false;
  const { showExpectedStateToast } = await import("./error-toast");
  showExpectedStateToast(
    i18n.t("plan:limitTitle"),
    i18n.t("plan:limitBody", {
      time: formatLocalDateTime(refusal.resetsAt, i18n.language),
    }),
  );
  return true;
}
