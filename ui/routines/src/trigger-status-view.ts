import type { TriggerLabels } from "./labels";
import type { TriggerStatusItem, TriggerStatusState } from "./types";

export type TriggerBadgeState = TriggerStatusState | "unknown";

export function triggerBadgeState(
  status?: TriggerStatusItem,
): TriggerBadgeState {
  return status?.status ?? "unknown";
}

export function triggerStatusDetail(
  status: TriggerStatusItem | undefined,
  labels: TriggerLabels,
): string | undefined {
  if (!status) return undefined;
  if (status.detail) return status.detail;
  if (status.status === "paused_disconnected")
    return labels.statusDisconnectedHint;
  if (status.status === "paused_revoked") return labels.statusRevokedHint;
  return undefined;
}

export function isWaitingForFirstEvent(
  status: TriggerStatusItem | undefined,
  hasRun: boolean,
): boolean {
  return status?.status === "active" && !hasRun;
}
