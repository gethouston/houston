import type { TriggerLabels } from "./labels";
import type { TriggerStatusItem, TriggerStatusState } from "./types";

/** The five wire states plus the presentational `"unknown"` fallback. */
export type TriggerBadgeState = TriggerStatusState | "unknown";

/** Resolve a routine's badge state; absent status → the muted `"unknown"` chip. */
export function triggerBadgeState(
  status?: TriggerStatusItem,
): TriggerBadgeState {
  return status?.status ?? "unknown";
}

/**
 * The human detail line for a status: the host's own `detail` when present,
 * else a standing hint for the paused states. Shown always (never hover-gated)
 * so an error or a disconnected account explains itself in place.
 */
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

/**
 * True when a trigger routine is delivering (`active`) but has not fired yet
 * (no run): the "Active. Waiting for the first event." idle line, shown instead
 * of an empty last-run slot.
 */
export function isWaitingForFirstEvent(
  status: TriggerStatusItem | undefined,
  hasRun: boolean,
): boolean {
  return status?.status === "active" && !hasRun;
}
