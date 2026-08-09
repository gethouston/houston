/**
 * ReportBugButton — the ONE "tell us about this" pill.
 *
 * The repo's no-silent-failures policy asks every user-visible failure to carry
 * a report path, and there can only be one of them: one payload shape (the
 * command tag, the diagnostic, the log tail `reportBug` bundles), one pending
 * look, one pair of result toasts. It started life inside the provider-error
 * cards and moved here the moment a second surface needed it (the team
 * sections' "we could not read these agents" strip), because a copied version
 * is how one of them quietly stops sending logs.
 *
 * `command` is the flat, snake_case triage tag every report site uses — never
 * composed per instance, or one issue fans out into unbounded Sentry groups.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { reportBug } from "../../lib/bug-report";
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
  /** The diagnostic that goes in the report body. */
  details: string;
  label: string;
}) {
  const { t } = useTranslation(["shell"]);
  const addToast = useUIStore((s) => s.addToast);
  const workspaceName = useWorkspaceStore((s) => s.current?.name);
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      await reportBug({
        command,
        error: details || "(no detail)",
        timestamp: new Date().toISOString(),
        appVersion: __APP_VERSION__,
        userEmail: getCurrentUserEmail(),
        workspaceName,
      });
      addToast({
        title: t("shell:toolRuntimeError.reportSuccessTitle"),
        description: t("shell:toolRuntimeError.reportSuccessDescription"),
        variant: "success",
      });
    } catch (err) {
      // The surfaces own their copy, so this can't go through
      // genericErrorDescription — but the reason still has to reach the log and
      // Sentry: a bug report that fails to send is exactly the failure we would
      // otherwise never hear about.
      logAndReportError("report_bug", err);
      addToast({
        title: t("shell:toolRuntimeError.reportErrorTitle"),
        description: t("shell:toolRuntimeError.reportErrorDescription"),
        variant: "error",
      });
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
