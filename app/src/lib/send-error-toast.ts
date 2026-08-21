import { useUIStore } from "../stores/ui";
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";
import { isStaleAttachmentError } from "./stale-attachment";

/**
 * The ONE toast for a send that failed BEFORE a turn stream existed
 * (attachment save, activity lookup, refused start): nothing wrote to the VM,
 * so this toast is the failure's only user-visible surface
 * (no-silent-failures rule). Shared by every pre-turn send catch so the
 * expected states below branch in one place instead of five.
 *
 * A stale attachment (see `isStaleAttachmentError`) is the user's disk
 * changing under an attached file, not a Houston bug: it gets authored,
 * actionable copy as a plain info toast — never the red box with a raw
 * DOMException, which reads as "Houston is broken" and gives no way out.
 * Sentry capture for it is silenced at the `save_attachments` call in
 * `tauri.ts`; the raw diagnostic still reaches the frontend log there.
 */
export function showSendFailedToast(err: unknown): void {
  if (isStaleAttachmentError(err)) {
    showExpectedStateToast(
      i18n.t("chat:errors.staleAttachmentTitle"),
      i18n.t("chat:errors.staleAttachmentBody"),
    );
    return;
  }
  useUIStore.getState().addToast({
    title: i18n.t("chat:errors.sessionStart", { error: String(err) }),
    variant: "error",
  });
}
