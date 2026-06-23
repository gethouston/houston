import type { WireEvent } from "./types";

/**
 * The in-flight conversation snapshot and its reducer — wire-level semantics
 * shared by every event fan-out point (the runtime's bus, the control plane's
 * turn relay). A late/reconnecting subscriber is caught up with a `sync` frame
 * built from this; the reducer defines exactly what that frame contains.
 */
export type ConversationSnapshot = { running: boolean; partial: string };

export const EMPTY_SNAPSHOT: ConversationSnapshot = {
  running: false,
  partial: "",
};

/**
 * Fold a wire event into the running snapshot. Pure. `partial` tracks only
 * assistant *text* (enough to redraw the in-flight bubble); tool/thinking
 * frames keep the turn marked running without touching it.
 */
export function reduceSnapshot(
  prev: ConversationSnapshot,
  event: WireEvent,
): ConversationSnapshot {
  switch (event.type) {
    case "user":
      return { running: true, partial: "" };
    case "text":
      return { running: true, partial: prev.partial + event.data };
    case "thinking":
    case "tool_start":
    case "tool_end":
    case "usage":
      return prev.running ? prev : { running: true, partial: prev.partial };
    case "done":
    case "error":
      return EMPTY_SNAPSHOT;
    case "provider_switched":
      // A mid-session provider switch is a boundary marker, not turn progress —
      // it's published while a turn is live, so leave running/partial untouched.
      return prev;
    case "sync":
      return prev; // sync is a read-out, never published back in
  }
}
