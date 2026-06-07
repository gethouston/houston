/**
 * Shared layout + CTA primitives for typed-provider-error cards.
 *
 * All variants share the same secondary-tinted slab (icon + title +
 * body + button row), the same retry button shape, and the same
 * report-bug + status-page helpers. Centralising them keeps the
 * per-variant files small (each renderer = copy + which CTAs to mount).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BugIcon, RotateCcwIcon } from "lucide-react";
import { Button, Spinner } from "@houston-ai/core";
import { reportBug } from "../../../lib/bug-report";
import { getCurrentUserEmail } from "../../../lib/current-user";
import { tauriSystem } from "../../../lib/tauri";
import { getProvider } from "../../../lib/providers";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";

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
    <div className="w-full min-w-0 overflow-hidden px-1 py-2">
      <div className="flex min-w-0 items-start gap-4 overflow-hidden rounded-2xl bg-secondary p-4 text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          {icon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
          <p className="break-words text-sm font-semibold text-foreground">{title}</p>
          <p className="break-words text-xs leading-relaxed text-muted-foreground">{body}</p>
          {children && (
            <div className="mt-2 flex min-w-0 w-full flex-wrap items-center gap-2">
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
  return (
    <Button
      size="sm"
      className="h-8 gap-2 rounded-full px-3 text-xs"
      disabled={running}
      onClick={() => void handle()}
    >
      {running ? <Spinner className="size-3.5" /> : <RotateCcwIcon className="size-3.5" />}
      {label}
    </Button>
  );
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
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-2 rounded-full px-3 text-xs"
      disabled={sending}
      onClick={() => void send()}
    >
      {sending ? <Spinner className="size-3.5" /> : <BugIcon className="size-3.5" />}
      {label}
    </Button>
  );
}

export function statusPageUrl(provider: string): string | null {
  switch (provider) {
    case "anthropic":
      return "https://status.anthropic.com/";
    case "openai":
      return "https://status.openai.com/";
    case "openrouter":
      return "https://status.openrouter.ai/";
    case "gemini":
      return "https://status.cloud.google.com/";
    default:
      return null;
  }
}
