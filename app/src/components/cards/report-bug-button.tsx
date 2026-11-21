import { useState } from "react";
import { useTranslation } from "react-i18next";
import { submitBugReport } from "../../lib/bug-report";
import { getCurrentUserEmail } from "../../lib/current-user";
import { logAndReportError } from "../../lib/error-report";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { RowCardButton } from "./row-card-button";

export function ReportBugButton({
  command,
  details,
  label,
}: {
  command: string;
  details: string;
  label: string;
}) {
  const { t } = useTranslation(["shell"]);
  const addToast = useUIStore((s) => s.addToast);
  const workspaceName = useWorkspaceStore((s) => s.current?.name);
  const [sending, setSending] = useState(false);
  const toast = (delivered: boolean) =>
    addToast({
      title: t(
        delivered
          ? "shell:reportBug.reportSuccessTitle"
          : "shell:reportBug.reportErrorTitle",
      ),
      description: t(
        delivered
          ? "shell:reportBug.reportSuccessDescription"
          : "shell:reportBug.reportErrorDescription",
      ),
      variant: delivered ? "success" : "error",
    });
  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      const outcome = await submitBugReport({
        command,
        error: details || "(no detail)",
        timestamp: new Date().toISOString(),
        appVersion: __APP_VERSION__,
        userEmail: getCurrentUserEmail(),
        workspaceName,
      });
      toast(outcome.delivered !== "none");
    } catch (err) {
      logAndReportError(command, err);
      toast(false);
    } finally {
      setSending(false);
    }
  };
  return (
    <RowCardButton
      label={label}
      variant="outline"
      onClick={send}
      loading={sending}
    />
  );
}
