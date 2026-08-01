import type { SpecimenProp } from "../../../src/specimen";

/**
 * `TriggerStatusBadgeProps` and `RoutineTriggerStatusProps`, read off
 * `ui/routines/src/trigger-status-badge.tsx` and `routine-trigger-status.tsx`.
 * Data only — the page beside this file renders it.
 */
export const badgeProps: readonly SpecimenProp[] = [
  {
    name: "status",
    type: "TriggerStatusItem",
    note: "Absent renders the muted `unknown` chip — the component never renders nothing.",
  },
  {
    name: "statusLabel",
    type: "string",
    note: "Overrides the chip's text while keeping the state's dot and tone.",
  },
  {
    name: "onReconnect",
    type: "() => void",
    note: "Only wired for `paused_disconnected`; its click never bubbles to a clickable row.",
  },
  {
    name: "withDetail",
    type: "boolean",
    note: "Defaults to `false`. Adds the explanatory line and the secondary Reconnect button.",
  },
  {
    name: "labels",
    type: "TriggerLabels",
    note: "Every visible string. Defaults to `DEFAULT_TRIGGER_LABELS`.",
  },
  {
    name: "className",
    type: "string",
    note: "Lands on the badge's wrapper (compact) or the block's row (withDetail).",
  },
  {
    name: "RoutineTriggerStatus hasRun",
    type: "boolean",
    note: 'Required. `active` + never run swaps the label for "Active. Waiting for the first event."',
  },
];
