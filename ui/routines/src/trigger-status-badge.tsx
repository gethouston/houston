/**
 * TriggerStatusBadge — the live provisioning status of an event-driven routine
 * (C9), as a sober colored-dot + human label (mirrors the integrations tab's
 * ConnectionStatusBadge treatment, never a tinted card). A disconnected account
 * offers a one-click Reconnect; a revoked toolkit explains access was turned
 * off. `null` status (a host that does not serve triggers) renders nothing —
 * the caller simply omits this component.
 *
 * Props-only and i18n-agnostic: all copy arrives via `labels` (English
 * defaults). `withDetail` switches from the compact row badge to the editor's
 * fuller block (adds the explanatory line + the Reconnect action).
 */
import { Button, cn } from "@houston-ai/core";
import { DEFAULT_TRIGGER_LABELS, type TriggerLabels } from "./labels";
import type { TriggerStatusItem, TriggerStatusState } from "./types";

const TONE: Record<TriggerStatusState, string> = {
  active: "text-success",
  pending: "text-ink-muted",
  paused_disconnected: "text-warning",
  paused_revoked: "text-warning",
  error: "text-danger",
};

const DOT: Record<TriggerStatusState, string> = {
  active: "bg-success",
  pending: "bg-ink-muted",
  paused_disconnected: "bg-warning",
  paused_revoked: "bg-warning",
  error: "bg-danger",
};

export interface TriggerStatusBadgeProps {
  status: TriggerStatusItem;
  /** Reconnect the disconnected account (only wired for `paused_disconnected`). */
  onReconnect?: () => void;
  /** Editor mode: show the explanatory line + the Reconnect button. */
  withDetail?: boolean;
  labels?: TriggerLabels;
  className?: string;
}

export function TriggerStatusBadge({
  status,
  onReconnect,
  withDetail = false,
  labels = DEFAULT_TRIGGER_LABELS,
  className,
}: TriggerStatusBadgeProps) {
  const state = status.status;
  const detail =
    status.detail ??
    (state === "paused_disconnected"
      ? labels.statusDisconnectedHint
      : state === "paused_revoked"
        ? labels.statusRevokedHint
        : undefined);
  const showReconnect = state === "paused_disconnected" && !!onReconnect;

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        TONE[state],
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[state])} />
      {labels.status[state]}
    </span>
  );

  if (!withDetail) {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        {badge}
        {showReconnect && (
          <Button variant="ghost" size="sm" onClick={onReconnect}>
            {labels.reconnect}
          </Button>
        )}
      </span>
    );
  }

  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        {badge}
        {detail && <p className="text-xs text-ink-muted">{detail}</p>}
      </div>
      {showReconnect && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onReconnect}
          className="shrink-0"
        >
          {labels.reconnect}
        </Button>
      )}
    </div>
  );
}
