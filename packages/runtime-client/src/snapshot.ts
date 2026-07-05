import type { WireFrame } from "./types";

/**
 * The in-flight conversation snapshot and its reducer — wire-level semantics
 * shared by every event fan-out point (the runtime's bus, the control plane's
 * turn relay). A late/reconnecting subscriber is caught up with a `sync` frame
 * built from this; the reducer defines exactly what that frame contains.
 *
 * `seq` is the stream's watermark: the seq of the last frame folded in (0 when
 * nothing was ever published). It survives turn end — the per-conversation seq
 * counter is process-lifetime — so a `sync` frame always tells the client
 * where the stream currently stands, and a resume cursor can be judged
 * against it.
 *
 * `turnId` is the RUNNING turn's id (see `WireFrame.turnId`): set by the
 * turn's `user` frame, carried while the turn is live, cleared by the terminal
 * frame. It rides into the `sync` frame's data so a connecting client knows
 * WHICH turn is running, and it is what the relay's dead-pump reaper stamps on
 * the terminal frame it synthesizes.
 */
export type ConversationSnapshot = {
  running: boolean;
  partial: string;
  seq: number;
  turnId?: string;
};

export const EMPTY_SNAPSHOT: ConversationSnapshot = {
  running: false,
  partial: "",
  seq: 0,
};

/**
 * Fold a wire frame into the running snapshot. Pure. `partial` tracks only
 * assistant *text* (enough to redraw the in-flight bubble); tool/thinking
 * frames keep the turn marked running without touching it. `seq` advances to
 * the frame's seq (kept as-is for an unsequenced event) — including on the
 * terminal frames, so the watermark outlives the turn. `turnId` is adopted
 * from the frames (a `user` frame starts a new turn, so its id — possibly
 * absent on a legacy frame — REPLACES the previous one) and dropped with the
 * terminal frame; `undefined` fields are omitted so the snapshot serializes
 * without noise.
 */
export function reduceSnapshot(
  prev: ConversationSnapshot,
  event: WireFrame,
): ConversationSnapshot {
  const seq = event.seq ?? prev.seq;
  const turnOf = (id: string | undefined) => (id ? { turnId: id } : {});
  switch (event.type) {
    case "user":
      return { running: true, partial: "", seq, ...turnOf(event.turnId) };
    case "text":
      return {
        running: true,
        partial: prev.partial + event.data,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
      };
    case "thinking":
    case "tool_start":
    case "tool_end":
    case "usage":
    case "file_changes":
      return {
        running: true,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
      };
    case "done":
    case "error":
    case "provider_error":
      // `provider_error` is terminal: pi ends the run on a failed turn and the
      // runtime does NOT emit a clean `done` after it, so this frame is what
      // clears the in-flight snapshot — otherwise a late subscriber's `sync`
      // would report the turn as still running forever.
      return { running: false, partial: "", seq };
    case "provider_switched":
    case "context_compacted":
      // Boundary markers (a mid-session provider switch / a proactive context
      // compaction), not turn progress — published while a turn is live, so
      // leave running/partial untouched.
      return {
        running: prev.running,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
      };
    case "sync":
      return prev; // sync is a read-out, never published back in
  }
}
