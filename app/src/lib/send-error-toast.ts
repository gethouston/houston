import { useUIStore } from "../stores/ui";
import { logAndReportError } from "./error-report";
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";
import { sendFailureAlreadyExplained } from "./send-failure-explained";
import { isStaleAttachmentError } from "./stale-attachment";

export function showSendFailedToast(err: unknown): void {
  if (isStaleAttachmentError(err)) {
    showExpectedStateToast(
      i18n.t("chat:errors.staleAttachmentTitle"),
      i18n.t("chat:errors.staleAttachmentBody"),
    );
    return;
  }
  logAndReportError("send_message", err);
  if (sendFailureAlreadyExplained(err)) return;
  useUIStore.getState().addToast({
    title: i18n.t("chat:errors.sessionStart"),
    variant: "error",
  });
}
