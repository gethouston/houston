import { expect, test } from "vitest";
import {
  formatSseFrame,
  isTerminalFrame,
  parseResumeCursor,
  REPLAY_BUFFER_CAP,
  ReplayLog,
} from "./replay";
import type { WireEvent } from "./types";

const text = (s: string): WireEvent => ({ type: "text", data: s });

// ---------------------------------------------------------------------------
// Sequencing
// ---------------------------------------------------------------------------

test("append assigns strictly monotonic seq starting at 1", () => {
  const log = new ReplayLog();
  expect(log.watermark).toBe(0);
  expect(log.append(text("a")).seq).toBe(1);
  expect(log.append(text("b")).seq).toBe(2);
  expect(log.append(text("c")).seq).toBe(3);
  expect(log.watermark).toBe(3);
});

test("append does not mutate the caller's event", () => {
  const event = text("a");
  const frame = new ReplayLog().append(event);
  expect(event).toEqual({ type: "text", data: "a" });
  expect(frame).toEqual({ type: "text", data: "a", seq: 1 });
});

test("a seeded watermark continues the stream, not restarts it", () => {
  const log = new ReplayLog(40);
  expect(log.watermark).toBe(40);
  expect(log.append(text("a")).seq).toBe(41);
});

test("append is the ONE sequencing authority: an incoming seq is ignored, never adopted", () => {
  const log = new ReplayLog();
  // Ahead, duplicate, and stale upstream seqs all get re-stamped watermark+1 —
  // trusting them would let a duplicate re-broadcast as new content or open a
  // silent replay gap.
  expect(log.append({ ...text("a"), seq: 5 }).seq).toBe(1);
  expect(log.append({ ...text("b"), seq: 1 }).seq).toBe(2);
  expect(log.append({ ...text("c"), seq: 999 }).seq).toBe(3);
  expect(log.watermark).toBe(3);
  // The whole window stays replayable — no adopted skip ever drops the prefix.
  expect(log.replayAfter(0)).toHaveLength(3);
});

test("append preserves the frame's other envelope fields (turnId)", () => {
  const log = new ReplayLog();
  expect(log.append({ ...text("a"), turnId: "t-1" })).toEqual({
    type: "text",
    data: "a",
    seq: 1,
    turnId: "t-1",
  });
});

// ---------------------------------------------------------------------------
// Replay windows
// ---------------------------------------------------------------------------

test("replayAfter returns exactly the frames after the cursor, in order", () => {
  const log = new ReplayLog();
  log.append(text("a"));
  log.append(text("b"));
  log.append(text("c"));
  expect(log.replayAfter(0)).toEqual([
    { type: "text", data: "a", seq: 1 },
    { type: "text", data: "b", seq: 2 },
    { type: "text", data: "c", seq: 3 },
  ]);
  expect(log.replayAfter(2)).toEqual([{ type: "text", data: "c", seq: 3 }]);
});

test("a cursor at the watermark replays nothing; ahead of it is unserviceable", () => {
  const log = new ReplayLog();
  log.append(text("a"));
  expect(log.replayAfter(1)).toEqual([]);
  expect(log.replayAfter(2)).toBeNull(); // e.g. cursor from before a restart
});

test("an empty log serves only cursor 0", () => {
  const log = new ReplayLog();
  expect(log.replayAfter(0)).toEqual([]);
  expect(log.replayAfter(1)).toBeNull();
  expect(log.replayAfter(-1)).toBeNull(); // defensive: parse rejects negatives upstream
});

test("overflow drops the oldest frames; cursors older than the window resync", () => {
  const log = new ReplayLog();
  for (let i = 1; i <= REPLAY_BUFFER_CAP + 10; i++) log.append(text(`${i}`));
  expect(log.watermark).toBe(REPLAY_BUFFER_CAP + 10);
  // First buffered frame is now seq 11: cursor 10 is servable, cursor 9 is not.
  expect(log.replayAfter(10)).toHaveLength(REPLAY_BUFFER_CAP);
  expect(log.replayAfter(9)).toBeNull();
  const tail = log.replayAfter(REPLAY_BUFFER_CAP + 9);
  expect(tail).toEqual([
    {
      type: "text",
      data: `${REPLAY_BUFFER_CAP + 10}`,
      seq: REPLAY_BUFFER_CAP + 10,
    },
  ]);
});

test("clear empties the buffer but keeps the watermark (counter never resets)", () => {
  const log = new ReplayLog();
  log.append(text("a"));
  log.append({ type: "done", data: null });
  log.clear();
  expect(log.watermark).toBe(2);
  expect(log.replayAfter(2)).toEqual([]); // caught up → nothing to send
  expect(log.replayAfter(1)).toBeNull(); // inside the cleared turn → resync
  expect(log.append(text("next turn")).seq).toBe(3);
});

// ---------------------------------------------------------------------------
// Cursor parsing
// ---------------------------------------------------------------------------

test("parseResumeCursor: query wins over the Last-Event-ID header", () => {
  expect(parseResumeCursor("7", "3")).toBe(7);
  expect(parseResumeCursor(null, "3")).toBe(3);
  expect(parseResumeCursor("0", "3")).toBe(0);
  expect(parseResumeCursor(null, undefined)).toBeUndefined();
});

test("parseResumeCursor: non-numeric / negative / non-integer values are absent", () => {
  expect(parseResumeCursor("abc", undefined)).toBeUndefined();
  expect(parseResumeCursor("-1", undefined)).toBeUndefined();
  expect(parseResumeCursor("1.5", undefined)).toBeUndefined();
  expect(parseResumeCursor("", undefined)).toBeUndefined();
  expect(parseResumeCursor(null, "nope")).toBeUndefined();
  // An invalid query is absent → the header still counts.
  expect(parseResumeCursor("abc", "4")).toBe(4);
  // A repeated header uses the first value (Node may fold headers into arrays).
  expect(parseResumeCursor(null, ["5", "9"])).toBe(5);
});

// ---------------------------------------------------------------------------
// SSE serialization + terminal classification
// ---------------------------------------------------------------------------

test("formatSseFrame writes id: + envelope seq for sequenced frames only", () => {
  expect(formatSseFrame({ type: "text", data: "hi", seq: 4 })).toBe(
    'id: 4\ndata: {"type":"text","data":"hi","seq":4}\n\n',
  );
  expect(formatSseFrame({ type: "done", data: null })).toBe(
    'data: {"type":"done","data":null}\n\n',
  );
});

test("formatSseFrame carries turnId through the envelope", () => {
  expect(
    formatSseFrame({ type: "done", data: null, seq: 7, turnId: "t-1" }),
  ).toBe('id: 7\ndata: {"type":"done","data":null,"seq":7,"turnId":"t-1"}\n\n');
});

test("isTerminalFrame flags exactly done/error/provider_error", () => {
  expect(isTerminalFrame("done")).toBe(true);
  expect(isTerminalFrame("error")).toBe(true);
  expect(isTerminalFrame("provider_error")).toBe(true);
  expect(isTerminalFrame("text")).toBe(false);
  expect(isTerminalFrame("sync")).toBe(false);
  expect(isTerminalFrame("user")).toBe(false);
});
