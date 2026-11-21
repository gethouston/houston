import { formatLocalDateTime, messageLimitRefusal } from "@houston/sdk";
import i18n from "./i18n";

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
