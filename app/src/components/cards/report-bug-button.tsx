/**
 * ReportBugButton — the ONE "tell us about this" pill.
 *
 * The repo's no-silent-failures policy asks every user-visible failure to carry
 * a report path, and there can only be one of them: one payload shape (the
 * command tag, the diagnostic, the log tail `reportBug` bundles), one pending
 * look, one pair of result toasts, one delivery rule (`submitBugReport`: Linear,
 * then the Sentry feedback fallback). It started life inside the provider-error
 * cards and moved here the moment a second surface needed it (the team
 * sections' "we could not read these agents" strip), because a copied version
 * is how one of them quietly stops sending logs.
 *
 * `command` is the flat, snake_case triage tag every report site uses — never
 * composed per instance, or one issue fans out into unbounded Sentry groups.
 */

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
  tags,
  label,
}: {
  command: string;
  /** The diagnostic that goes in the report body. */
  details: string;
  /** Triage tags built by the SDK (`providerErrorReportTags`). */
  tags?: Record<string, string>;
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
      // Reports every channel failure itself; `none` = Linear AND the
      // fallback both failed, the only case that earns a "try again".
      const outcome = await submitBugReport({
        command,
        error: details || "(no detail)",
        tags,
        timestamp: new Date().toISOString(),
        appVersion: __APP_VERSION__,
        userEmail: getCurrentUserEmail(),
        workspaceName,
      });
      toast(outcome.delivered !== "none");
    } catch (err) {
      // Not a channel failure (those settle as `none`): a bug in the
      // submit path itself, which must still reach us.
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
