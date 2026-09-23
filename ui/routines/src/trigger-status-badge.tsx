/**
 * TriggerStatusBadge — the live provisioning status of an event-driven routine
 * (C9), as a sober colored-dot + human label (mirrors the integrations
 * `ConnectionStatusBadge` treatment, never a tinted card). A disconnected account
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
  TRIGGER_DOT_CLASS,
  TRIGGER_TONE_CLASS,
} from "./trigger-status-badge-styles";
import { triggerBadgeState, triggerStatusDetail } from "./trigger-status-view";
import type { TriggerStatusItem } from "./types";

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
        TRIGGER_TONE_CLASS[state],
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          TRIGGER_DOT_CLASS[state],
        )}
      />
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
