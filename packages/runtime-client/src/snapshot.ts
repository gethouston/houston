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
/** One of the running turn's tool calls, as the snapshot tracks it. `isError`
 *  present = the tool ENDED (with that flag); absent = still running.
 *  `content` is an ended tool's output preview (already clipped at the
 *  emitting backend). */
export type SnapshotTool = {
  name: string;
  input?: unknown;
  isError?: boolean;
  content?: string;
};

export type ConversationSnapshot = {
  running: boolean;
  partial: string;
  seq: number;
  turnId?: string;
  /** The running turn's reasoning so far (cumulative, like `partial`). Omitted
   *  when idle or when the turn produced none — a late subscriber replays it
   *  so the mission log shows what streamed before it connected (HOU-717). */
  thinking?: string;
  /** The running turn's tool calls so far, in stream order. Same omission
   *  semantics as `thinking`. */
  tools?: SnapshotTool[];
};

export const EMPTY_SNAPSHOT: ConversationSnapshot = {
  running: false,
  partial: "",
  seq: 0,
};

/**
 * Fold a wire frame into the running snapshot. Pure. `partial` tracks the
 * assistant *text*; `thinking`/`tools` track the turn's reasoning and tool
 * activity (HOU-717 — a late subscriber replays them so the mission log is
 * complete, not just the text bubble). `seq` advances to the frame's seq
 * (kept as-is for an unsequenced event) — including on the terminal frames,
 * so the watermark outlives the turn. `turnId` is adopted from the frames (a
 * `user` frame starts a new turn, so its id — possibly absent on a legacy
 * frame — REPLACES the previous one) and dropped with the terminal frame;
 * `undefined` fields are omitted so the snapshot serializes without noise.
 */
export function reduceSnapshot(
  prev: ConversationSnapshot,
  event: WireFrame,
): ConversationSnapshot {
  const seq = event.seq ?? prev.seq;
  const turnOf = (id: string | undefined) => (id ? { turnId: id } : {});
  // The running turn's accumulated activity, carried through non-terminal
  // frames (omitted keys stay omitted so the snapshot serializes lean).
  const activity = () => ({
    ...(prev.thinking !== undefined ? { thinking: prev.thinking } : {}),
    ...(prev.tools !== undefined ? { tools: prev.tools } : {}),
  });
  switch (event.type) {
    case "user":
      // A new turn: reset text AND the previous turn's thinking/tools.
      return { running: true, partial: "", seq, ...turnOf(event.turnId) };
    case "text":
      return {
        running: true,
        partial: prev.partial + event.data,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
      };
    case "thinking":
      return {
        running: true,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
        thinking: (prev.thinking ?? "") + event.data,
      };
    case "tool_start":
      return {
        running: true,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
        tools: [
          ...(prev.tools ?? []),
          { name: event.data.name, input: event.data.args },
        ],
      };
    case "tool_end": {
      // Mark the last still-running tool as ended. Tools run one at a time
      // within a turn, so that is the tool this frame closes.
      const tools = [...(prev.tools ?? [])];
      for (let i = tools.length - 1; i >= 0; i--) {
        const t = tools[i];
        if (t && t.isError === undefined) {
          tools[i] = {
            ...t,
            isError: event.data.isError,
            ...(event.data.content ? { content: event.data.content } : {}),
          };
          break;
        }
      }
      return {
        running: true,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
        ...(tools.length ? { tools } : {}),
      };
    }
    case "usage":
    case "file_changes":
      return {
        running: true,
        partial: prev.partial,
        seq,
        ...turnOf(event.turnId ?? prev.turnId),
        ...activity(),
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
        ...activity(),
      };
    case "sync":
      return prev; // sync is a read-out, never published back in
  }
}
