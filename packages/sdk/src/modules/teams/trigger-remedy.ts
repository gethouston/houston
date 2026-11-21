import type { TriggerStatusItem } from "@houston/wire-types";

export type { TriggerStatusReason } from "@houston/wire-types";

export type TriggerRemedy =
  | "reconnect"
  | "pick_another_event"
  | "check_settings"
  | "none";

export function triggerRemedy(
  item: TriggerStatusItem | undefined,
): TriggerRemedy {
  if (!item) return "none";
  if (item.status === "paused_disconnected") return "reconnect";
  if (item.status !== "error") return "none";
  switch (item.reason) {
    case "trigger_type_gone":
      return "pick_another_event";
    case "config_rejected":
      return "check_settings";
    default:
      return "none";
  }
}
