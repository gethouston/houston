import type { TriggerPlanSkipped } from "./trigger-plan-skip";

export type TriggerStatusState =
  | "active"
  | "pending"
  | "paused_disconnected"
  | "paused_revoked"
  | "error";

export const TRIGGER_STATUS_REASONS = [
  "trigger_type_gone",
  "config_rejected",
  "needs_reauth",
  "rejected",
] as const;

export type TriggerStatusReason = (typeof TRIGGER_STATUS_REASONS)[number];

export interface TriggerStatusItem {
  routine_id: string;
  status: TriggerStatusState;
  detail?: string;
  reason?: TriggerStatusReason;
  plan_skipped?: TriggerPlanSkipped;
}

export function parseTriggerStatusReason(
  value: unknown,
): TriggerStatusReason | undefined {
  return isReason(value) ? value : undefined;
}

function isReason(value: unknown): value is TriggerStatusReason {
  return (
    typeof value === "string" &&
    (TRIGGER_STATUS_REASONS as readonly string[]).includes(value)
  );
}
