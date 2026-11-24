import { DEFAULT_TRIGGER_LABELS, type TriggerLabels } from "./labels";
import { TriggerStatusBadge } from "./trigger-status-badge";
import { isWaitingForFirstEvent } from "./trigger-status-view";
import type { TriggerStatusItem } from "./types";

export interface RoutineTriggerStatusProps {
  /** Live status; absent renders the muted "checking" chip. */
  status?: TriggerStatusItem;
  /** Whether the routine has ever run — gates the "waiting for the first event". */
  hasRun: boolean;
  /** Reconnect the disconnected account behind a `paused_disconnected` routine. */
  onReconnect?: () => void;
  labels?: TriggerLabels;
  className?: string;
}

export function RoutineTriggerStatus({
  status,
  hasRun,
  onReconnect,
  labels = DEFAULT_TRIGGER_LABELS,
  className,
}: RoutineTriggerStatusProps) {
  const waiting = isWaitingForFirstEvent(status, hasRun);
  return (
    <TriggerStatusBadge
      status={status}
      statusLabel={waiting ? labels.waitingFirstEvent : undefined}
      onReconnect={onReconnect}
      labels={labels}
      className={className}
    />
  );
}
