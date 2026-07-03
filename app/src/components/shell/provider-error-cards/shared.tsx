/**
 * Shared layout + CTA primitives for typed-provider-error cards.
 *
 * The card surface is mid-migration to the unified `RowCard` (HOU-467): the
 * stateful pills below (retry with spinner, report-bug + toast) are thin
 * wrappers over `RowCardButton` so migrated variants match the reconnect /
 * integration cards exactly. Variants that have not been ported yet still
 * render on the secondary-tinted `ErrorCard` slab (icon + title + body +
 * button row) and can mount the `StatusPageButton` / `statusPageUrl` helper.
 * Either way the per-variant files own only the copy + which CTAs to mount.
 */

import { Button } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { reportBug } from "../../../lib/bug-report";
import { getCurrentUserEmail } from "../../../lib/current-user";
import { getProvider } from "../../../lib/providers";
import { tauriSystem } from "../../../lib/tauri";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { RowCardButton } from "../../cards/row-card-button";

export function ErrorCard({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="w-full px-1 py-2">
      <div className="flex items-start gap-4 rounded-2xl bg-secondary p-4 text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          {icon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {body}
          </p>
          {children && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-2 rounded-full px-3 text-xs"
      onClick={() => void tauriSystem.openUrl(url)}
    >
      {label}
    </Button>
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
    case "github-copilot":
      return "https://www.githubstatus.com/";
    default:
      return null;
  }
}
