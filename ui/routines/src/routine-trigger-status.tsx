import { DEFAULT_TRIGGER_LABELS, type TriggerLabels } from "./labels";
import { TriggerStatusBadge } from "./trigger-status-badge";
import { isWaitingForFirstEvent } from "./trigger-status-view";
import type { TriggerStatusItem } from "./types";

export interface RoutineTriggerStatusProps {
  status?: TriggerStatusItem;
  hasRun: boolean;
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
