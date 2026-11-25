import type { TriggerStatusItem } from "@houston/wire-types";

export type { TriggerStatusReason } from "@houston/wire-types";

/**
 * What the person should do about a routine's trigger binding.
 *
 * - `reconnect`: the connected account is disconnected; reconnecting it fixes
 *   the binding.
 * - `pick_another_event`: the app no longer offers the event. The binding is
 *   retried only rarely (about daily, backing off to weekly) and right away
 *   once the routine is edited to wake on a different event; reconnecting the
 *   account changes nothing, so it must never be offered.
 * - `check_settings`: the app refused the setup. It is retried automatically;
 *   if it does not start working, the person edits the routine's settings.
 * - `none`: healthy, settling, or a failure with no known remedy.
 */
export type TriggerRemedy =
  | "reconnect"
  | "pick_another_event"
  | "check_settings"
  | "none";

/**
 * The remedy for one routine's trigger status. Every surface (the routine
 * screen's chip, the grid, the AI Manager) reads it from here so none decides
 * on its own which status deserves a Reconnect.
 */
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
