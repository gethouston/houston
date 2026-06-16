/**
 * Shared CTA primitives + helpers for typed-provider-error cards.
 *
 * Every variant renders on the unified `RowCard` (HOU-467); these are the
 * stateful pills that sit in its `action` slot — retry (with spinner),
 * status-page link, and report-bug (the `reportBug` call + toast). All three
 * are thin wrappers over `RowCardButton` so the error cards match the
 * reconnect / integration cards exactly. The per-variant files own only the
 * copy + which CTAs to mount.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { reportBug } from "../../../lib/bug-report";
import { getCurrentUserEmail } from "../../../lib/current-user";
import { tauriSystem } from "../../../lib/tauri";
import { getProvider } from "../../../lib/providers";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { RowCardButton } from "../../cards/row-card-button";

export function providerLabel(id: string): string {
  return getProvider(id)?.name ?? id;
}

export function RetryButton({
  onRetry,
  label,
}: {
  onRetry: () => Promise<void> | void;
  label: string;
}) {
  const [running, setRunning] = useState(false);
  const handle = async () => {
    if (running) return;
    setRunning(true);
    try {
      await onRetry();
    } finally {
      setRunning(false);
    }
  };
  return <RowCardButton label={label} onClick={handle} loading={running} />;
}

export function StatusPageButton({
  provider,
  label,
}: {
  provider: string;
  label: string;
}) {
  const url = statusPageUrl(provider);
  if (!url) return null;
  return (
    <RowCardButton
      label={label}
      variant="outline"
      onClick={() => tauriSystem.openUrl(url)}
    />
  );
}

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
    } catch {
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

export function statusPageUrl(provider: string): string | null {
  switch (provider) {
    case "anthropic":
      return "https://status.anthropic.com/";
    case "openai":
      return "https://status.openai.com/";
    case "gemini":
      return "https://status.cloud.google.com/";
    default:
      return null;
  }
}
