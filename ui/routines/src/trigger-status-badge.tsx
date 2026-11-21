import { Button, cn } from "@houston-ai/core";
import { DEFAULT_TRIGGER_LABELS, type TriggerLabels } from "./labels";
import {
  TRIGGER_DOT_CLASS,
  TRIGGER_TONE_CLASS,
} from "./trigger-status-badge-styles";
import { triggerBadgeState, triggerStatusDetail } from "./trigger-status-view";
import type { TriggerStatusItem } from "./types";

export interface TriggerStatusBadgeProps {
  status?: TriggerStatusItem;
  statusLabel?: string;
  onReconnect?: () => void;
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
