import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { reportBug } from "../../lib/bug-report";
import { getCurrentUserEmail } from "../../lib/current-user";
import { genericErrorDescription } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";

/**
 * Voluntary feedback dialog. The companion to Sentry's auto-capture: crashes
 * land in Sentry on their own, this is for the things Sentry can't see —
 * UX confusion, missing features, ideas, soft errors that didn't throw.
 *
 * Submits to the same Linear-bug-report Tauri command the previous "Report
 * bug" toast action used, but now with the user's typed message in the
 * payload (bug-report.ts → BugReportPayload.user_message → format.rs leads
 * the issue title + description with it).
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("shell");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const addToast = useUIStore((s) => s.addToast);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const issueId = await reportBug({
        command: "user_feedback",
        error: "(user-submitted feedback, not an error)",
        timestamp: new Date().toISOString(),
        appVersion: __APP_VERSION__,
        userEmail: getCurrentUserEmail(),
        userMessage: trimmed,
      });
      addToast({
        title: t("feedback.successTitle"),
        description: issueId
          ? t("feedback.successWithId", { id: issueId })
          : t("feedback.successNoId"),
        variant: "success",
      });
      setMessage("");
      onOpenChange(false);
    } catch (err) {
      addToast({
        title: t("feedback.errorTitle"),
        description: genericErrorDescription("user_feedback", err),
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("feedback.title")}</DialogTitle>
          <DialogDescription>{t("feedback.description")}</DialogDescription>
        </DialogHeader>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("feedback.placeholder")}
          rows={5}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          disabled={sending}
          autoFocus
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            {t("feedback.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || message.trim().length === 0}
          >
            {sending ? t("feedback.sending") : t("feedback.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
