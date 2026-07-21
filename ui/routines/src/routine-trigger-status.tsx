/**
 * RoutineTriggerStatus — a trigger routine's health chip, inline on the row's
 * ONE summary line (no longer a stacked block). Rendered for EVERY routine with
 * an event binding, so a trigger routine always tells the truth about whether it
 * can fire:
 *
 * - a real status → the state chip (error / paused keep their tone and, for a
 *   disconnected account, a one-click Reconnect — always visible, never
 *   hover-gated);
 * - no status yet → the muted "checking" chip (never a healthy look);
 * - delivering but not yet fired → the "Active. Waiting for the first event."
 *   label, so an active-with-no-runs trigger reads as ready.
 *
 * The explanatory detail line (why an account is disconnected, etc.) now lives
 * in the chat header, keeping the list row to a single line.
 */
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
