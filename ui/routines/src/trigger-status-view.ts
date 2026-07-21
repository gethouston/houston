/**
 * Pure view helpers for a trigger routine's live status — shared by the compact
 * row block (`RoutineTriggerStatus`) and the badge (`TriggerStatusBadge`), and
 * unit-tested directly (the components are JSX, this is plain logic).
 *
 * The load-bearing rule: a routine with a trigger binding ALWAYS resolves to a
 * status. When no status item has arrived (the host is still checking, or a
 * deployment that serves none), it resolves to the muted `"unknown"` state —
 * never to "nothing", so a trigger that can never fire can never hide.
 */
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
