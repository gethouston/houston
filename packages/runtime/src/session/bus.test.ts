import type { SequencedFrame } from "@houston/runtime-client";
import { expect, test } from "vitest";
import {
  anyTurnRunning,
  evict,
  publish,
  reduceSnapshot,
  replayAfter,
  snapshot,
  subscribe,
  subscriberCount,
} from "./bus";

// Unique id per test so the module-level maps never bleed across cases.
let counter = 0;
const freshId = () => `test-conv-${counter++}`;

test("anyTurnRunning reports whether any channel snapshot is running", () => {
  const id = freshId();
  expect(anyTurnRunning()).toBe(false);
  publish(id, { type: "user", data: { content: "go", ts: 1 } });
  expect(anyTurnRunning()).toBe(true);
  publish(id, { type: "done", data: null });
  expect(anyTurnRunning()).toBe(false);
  evict(id);
});

test("events reach only that conversation's subscribers, stamped with seq", () => {
  const a = freshId();
  const b = freshId();
  const aEvents: SequencedFrame[] = [];
  const bEvents: SequencedFrame[] = [];
  const unsubA = subscribe(a, (e) => aEvents.push(e));
  const unsubB = subscribe(b, (e) => bEvents.push(e));

  publish(a, { type: "text", data: "hello from A" });

  expect(aEvents).toHaveLength(1);
  expect(bEvents).toHaveLength(0); // the isolation guarantee
  expect(aEvents[0]).toEqual({ type: "text", data: "hello from A", seq: 1 });

  unsubA();
  unsubB();
});

test("two concurrent conversations never cross, and each has its own seq counter", () => {
  const a = freshId();
  const b = freshId();
  const aTexts: string[] = [];
  const bSeqs: number[] = [];
  subscribe(a, (e) => {
    if (e.type === "text") aTexts.push(e.data);
  });
  subscribe(b, (e) => bSeqs.push(e.seq));

  publish(a, { type: "text", data: "a1" });
  publish(b, { type: "text", data: "b1" });
  publish(a, { type: "text", data: "a2" });
  publish(b, { type: "text", data: "b2" });

  expect(aTexts).toEqual(["a1", "a2"]);
  expect(bSeqs).toEqual([1, 2]); // b's counter is untouched by a's publishes
  expect(snapshot(a).seq).toBe(2);
});

test("unsubscribe stops delivery and clears the subscriber set", () => {
  const id = freshId();
  const seen: SequencedFrame[] = [];
  const unsub = subscribe(id, (e) => seen.push(e));
  publish(id, { type: "text", data: "one" });
  unsub();
  publish(id, { type: "text", data: "two" });
  expect(seen).toHaveLength(1);
  expect(subscriberCount(id)).toBe(0);
});

test("snapshot catches a late subscriber up to the in-flight turn (with the watermark)", () => {
  const id = freshId();
  publish(id, { type: "user", data: { content: "hi", ts: 1 } });
  publish(id, { type: "text", data: "Hel" });
  publish(id, { type: "text", data: "lo" });

  // A client connecting now is told the turn is running + handed the text so far.
  expect(snapshot(id)).toEqual({ running: true, partial: "Hello", seq: 3 });

  publish(id, { type: "done", data: null });
  // Cleared after the turn — but the seq watermark survives (counter never resets).
  expect(snapshot(id)).toEqual({ running: false, partial: "", seq: 4 });
});

test("a new `user` event resets the partial for the next turn", () => {
  const id = freshId();
  publish(id, { type: "user", data: { content: "q1", ts: 1 } });
  publish(id, { type: "text", data: "answer one" });
  publish(id, { type: "done", data: null });
  publish(id, { type: "user", data: { content: "q2", ts: 2 } });
  expect(snapshot(id)).toEqual({ running: true, partial: "", seq: 4 });
});

test("reduceSnapshot keeps the turn running through tool/thinking frames", () => {
  let s = reduceSnapshot(
    { running: false, partial: "", seq: 0 },
    { type: "user", data: { content: "go", ts: 1 } },
  );
  s = reduceSnapshot(s, { type: "text", data: "work" });
  s = reduceSnapshot(s, { type: "tool_start", data: { name: "ls", args: {} } });
  // tool frame doesn't touch text — it lands in the tools list (HOU-717)
  expect(s).toEqual({
    running: true,
    partial: "work",
    seq: 0,
    tools: [{ name: "ls", input: {} }],
  });
  s = reduceSnapshot(s, {
    type: "tool_end",
    data: { name: "ls", isError: false },
  });
  expect(s.running).toBe(true);
  s = reduceSnapshot(s, { type: "error", data: { message: "boom" } });
  expect(s).toEqual({ running: false, partial: "", seq: 0 });
});

test("a brand-new conversation has an empty snapshot and no subscribers", () => {
  const id = freshId();
  expect(snapshot(id)).toEqual({ running: false, partial: "", seq: 0 });
  expect(subscriberCount(id)).toBe(0);
});

test("a callback that unsubscribes mid-fan-out does not break delivery", () => {
  const id = freshId();
  const order: string[] = [];
  const unsubFirst = subscribe(id, () => {
    order.push("first");
    unsubFirst(); // remove self while publish is iterating
  });
  subscribe(id, () => order.push("second"));
  publish(id, { type: "done", data: null });
  expect(order).toEqual(["first", "second"]);
  expect(subscriberCount(id)).toBe(1);
});

// ---------------------------------------------------------------------------
// Sequencing + replay (the resume contract's fan-out half)
// ---------------------------------------------------------------------------

test("seq is strictly monotonic across turns — never reset by the terminal clear", () => {
  const id = freshId();
  const seqs: number[] = [];
  subscribe(id, (e) => seqs.push(e.seq));
  publish(id, { type: "user", data: { content: "q1", ts: 1 } });
  publish(id, { type: "done", data: null });
  publish(id, { type: "user", data: { content: "q2", ts: 2 } });
  publish(id, { type: "done", data: null });
  expect(seqs).toEqual([1, 2, 3, 4]);
});

test("replayAfter serves the in-flight turn's window", () => {
  const id = freshId();
  publish(id, { type: "user", data: { content: "hi", ts: 1 } });
  publish(id, { type: "text", data: "Hel" });
  publish(id, { type: "text", data: "lo" });
  expect(replayAfter(id, 1)).toEqual([
    { type: "text", data: "Hel", seq: 2 },
    { type: "text", data: "lo", seq: 3 },
  ]);
  expect(replayAfter(id, 3)).toEqual([]); // caught up
  expect(replayAfter(id, 9)).toBeNull(); // ahead of the watermark → resync
});

test("the terminal frame clears the replay window; the cursor then resyncs", () => {
  const id = freshId();
  publish(id, { type: "user", data: { content: "hi", ts: 1 } });
  publish(id, { type: "text", data: "answer" });
  publish(id, { type: "done", data: null });
  expect(replayAfter(id, 1)).toBeNull(); // inside the cleared turn → resync + history refetch
  expect(replayAfter(id, 3)).toEqual([]); // exactly at the watermark → nothing missed
});

test("a conversation never published in this process serves only cursor 0", () => {
  const id = freshId();
  expect(replayAfter(id, 0)).toEqual([]);
  expect(replayAfter(id, 5)).toBeNull(); // pre-restart cursor → resync
});

test("turnId rides publish into the frames and the snapshot's sync read-out", () => {
  const id = freshId();
  const seen: SequencedFrame[] = [];
  subscribe(id, (e) => seen.push(e));
  publish(id, { type: "user", data: { content: "hi", ts: 1 }, turnId: "t-1" });
  publish(id, { type: "text", data: "Hel", turnId: "t-1" });
  expect(seen.map((f) => f.turnId)).toEqual(["t-1", "t-1"]);
  expect(snapshot(id)).toEqual({
    running: true,
    partial: "Hel",
    seq: 2,
    turnId: "t-1",
  });
  publish(id, { type: "done", data: null, turnId: "t-1" });
  expect(snapshot(id).turnId).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Eviction (conversation DELETE)
// ---------------------------------------------------------------------------

test("evict drops the whole channel: old cursors resync, the stream restarts at 1", () => {
  const id = freshId();
  publish(id, { type: "user", data: { content: "hi", ts: 1 } }); // 1
  publish(id, { type: "text", data: "answer" }); // 2

  evict(id);

  // The deleted conversation's stream state is gone entirely.
  expect(snapshot(id)).toEqual({ running: false, partial: "", seq: 0 });
  expect(replayAfter(id, 2)).toBeNull(); // any outstanding cursor → resync
  expect(replayAfter(id, 0)).toEqual([]);

  // A re-created conversation starts a fresh stream — and a subscriber that
  // stayed connected across the eviction still receives it (arrival order is
  // authoritative; nothing filters on the old watermark).
  const seen: SequencedFrame[] = [];
  subscribe(id, (e) => seen.push(e));
  publish(id, { type: "user", data: { content: "second life", ts: 2 } });
  expect(seen.map((f) => f.seq)).toEqual([1]);
});
