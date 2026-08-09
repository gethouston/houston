/**
 * Shared layout + CTA primitives for typed-provider-error cards.
 *
 * The card surface is mid-migration to the unified `RowCard` (HOU-467): the
 * stateful pills below are thin wrappers over `RowCardButton` so migrated
 * variants match the reconnect / integration cards exactly. `ReportBugButton`
 * is re-exported from `components/cards/`, where it moved once a second surface
 * (the team sections' failure strip) needed the same one report path.
 * Variants that have not been ported yet still render on the
 * secondary-tinted `ErrorCard` slab (icon + title + body + button row) and can
 * mount the `StatusPageButton` / `statusPageUrl` helper.
 * Either way the per-variant files own only the copy + which CTAs to mount.
 */

import { Button } from "@houston-ai/core";
import { useState } from "react";
import { getProvider } from "../../../lib/providers";
import { tauriSystem } from "../../../lib/tauri";
import { RowCardButton } from "../../cards/row-card-button";

export { ReportBugButton } from "../../cards/report-bug-button";

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
      <div className="flex items-start gap-4 rounded-2xl bg-chip p-4 text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-input text-ink-muted">
          {icon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs leading-relaxed text-ink-muted">{body}</p>
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
