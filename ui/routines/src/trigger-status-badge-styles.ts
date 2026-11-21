import type { TriggerBadgeState } from "./trigger-status-view";

export const TRIGGER_TONE_CLASS: Record<TriggerBadgeState, string> = {
  active: "text-success-ink",
  pending: "text-ink-muted",
  paused_disconnected: "text-warning-ink",
  paused_revoked: "text-warning-ink",
  error: "text-danger-ink",
  unknown: "text-ink-muted",
};

export const TRIGGER_DOT_CLASS: Record<TriggerBadgeState, string> = {
  active: "bg-success",
  pending: "bg-ink-muted",
  paused_disconnected: "bg-warning",
  paused_revoked: "bg-warning",
  error: "bg-danger",
  unknown: "border border-ink-muted animate-pulse",
};
