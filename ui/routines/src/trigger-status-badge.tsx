/**
 * TriggerStatusBadge — the live provisioning status of an event-driven routine
 * (C9), as a sober colored-dot + human label (mirrors the integrations tab's
 * ConnectionStatusBadge treatment, never a tinted card). A disconnected account
 * offers a one-click Reconnect; a revoked toolkit explains access was turned
 * off.
 *
 * A trigger routine ALWAYS shows a status: when no status item has arrived yet
 * (the host is still checking, or a deployment that serves none) the badge
 * renders a muted, hollow-dot `"unknown"` chip that never reads as healthy —
 * it never renders nothing.
 *
 * Props-only and i18n-agnostic: all copy arrives via `labels` (English
 * defaults). `withDetail` switches from the compact row badge to the editor's
 * fuller block (adds the explanatory line + the Reconnect action).
 */
import { Button, cn } from "@houston-ai/core";
import { DEFAULT_TRIGGER_LABELS, type TriggerLabels } from "./labels";
import {
  type TriggerBadgeState,
  triggerBadgeState,
  triggerStatusDetail,
} from "./trigger-status-view";
import type { TriggerStatusItem } from "./types";

const TONE: Record<TriggerBadgeState, string> = {
  active: "text-success",
  pending: "text-ink-muted",
  paused_disconnected: "text-warning",
  paused_revoked: "text-warning",
  error: "text-danger",
  unknown: "text-ink-muted",
};

const DOT: Record<TriggerBadgeState, string> = {
  active: "bg-success",
  pending: "bg-ink-muted",
  paused_disconnected: "bg-warning",
  paused_revoked: "bg-warning",
  error: "bg-danger",
  // A hollow, pulsing ring — visibly "checking", never a healthy fill.
  unknown: "border border-ink-muted animate-pulse",
};

export interface TriggerStatusBadgeProps {
  /** Live status. Absent renders the muted "checking" (`unknown`) chip. */
  status?: TriggerStatusItem;
  /** Override the chip's text while keeping the state's dot + tone — used for
   *  the "Active. Waiting for the first event." idle line. */
  statusLabel?: string;
  /** Reconnect the disconnected account (only wired for `paused_disconnected`). */
  onReconnect?: () => void;
  /** Editor mode: show the explanatory line + the Reconnect button. */
  withDetail?: boolean;
  labels?: TriggerLabels;
  className?: string;
}

export function TriggerStatusBadge({
  status,
  statusLabel,
  onReconnect,
  withDetail = false,
  labels = DEFAULT_TRIGGER_LABELS,
  className,
}: TriggerStatusBadgeProps) {
  const state = triggerBadgeState(status);
  const label =
    statusLabel ??
    (state === "unknown" ? labels.statusUnknown : labels.status[state]);
  const detail = triggerStatusDetail(status, labels);
  const showReconnect = state === "paused_disconnected" && !!onReconnect;

  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        TONE[state],
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", DOT[state])} />
      {label}
    </span>
  );

  if (!withDetail) {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        {badge}
        {showReconnect && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              // The badge can ride a clickable list row; don't open its chat.
              e.stopPropagation();
              onReconnect?.();
            }}
          >
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
          onClick={(e) => {
            e.stopPropagation();
            onReconnect?.();
          }}
          className="shrink-0"
        >
          {labels.reconnect}
        </Button>
      )}
    </div>
  );
}
