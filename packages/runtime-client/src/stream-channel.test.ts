import { expect, test } from "vitest";
import type { SequencedFrame } from "./replay";
import type { ConversationSnapshot } from "./snapshot";
import { StreamChannel } from "./stream-channel";
import type { WireEvent } from "./types";

const user = (content: string): WireEvent => ({
  type: "user",
  data: { content, ts: 1 },
});
const text = (s: string): WireEvent => ({ type: "text", data: s });

test("publish sequences, reduces, and fans out frame + snapshot in order", () => {
  const ch = new StreamChannel();
  const seen: Array<{ frame: SequencedFrame; snap: ConversationSnapshot }> = [];
  ch.publish(user("hi"), (frame, snap) => seen.push({ frame, snap }));
  ch.publish(text("Hel"), (frame, snap) => seen.push({ frame, snap }));
  ch.publish(text("lo"), (frame, snap) => seen.push({ frame, snap }));

  expect(seen.map((s) => s.frame.seq)).toEqual([1, 2, 3]);
  expect(seen[2].snap).toEqual({ running: true, partial: "Hello", seq: 3 });
  expect(ch.snapshot).toEqual({ running: true, partial: "Hello", seq: 3 });
  expect(ch.replayAfter(1)).toHaveLength(2);
});

test("a terminal frame clears the replay window AFTER fan-out; the counter survives", () => {
  const ch = new StreamChannel();
  ch.publish(user("hi"), () => {});
  let windowAtFanout: SequencedFrame[] | null = null;
  ch.publish({ type: "done", data: null }, (frame) => {
    windowAtFanout = ch.replayAfter(frame.seq - 1);
  });
  expect(windowAtFanout).toHaveLength(1);
  expect(ch.replayAfter(1)).toBeNull();
  expect(ch.replayAfter(2)).toEqual([]);
  expect(ch.publish(user("next"), () => {}).seq).toBe(3);
});

test("a throwing fan-out still clears the terminal window (no stuck replay state)", () => {
  const ch = new StreamChannel();
  ch.publish(user("hi"), () => {});
  expect(() =>
    ch.publish({ type: "error", data: { message: "boom" } }, () => {
      throw new Error("subscriber exploded");
    }),
  ).toThrow("subscriber exploded");
  expect(ch.replayAfter(1)).toBeNull();
  expect(ch.snapshot.running).toBe(false);
});

test("a seed snapshot continues the stream where it left off", () => {
  const ch = new StreamChannel({
    running: true,
    partial: "so far",
    seq: 40,
    turnId: "t-1",
  });
  expect(ch.snapshot.turnId).toBe("t-1");
  const frame = ch.publish(text("…more"), () => {});
  expect(frame.seq).toBe(41);
  expect(ch.snapshot).toEqual({
    running: true,
    partial: "so far…more",
    seq: 41,
    turnId: "t-1",
  });
});

test("publishAsync keeps the same ordering with an async fan-out", async () => {
  const ch = new StreamChannel();
  const order: string[] = [];
  await ch.publishAsync(user("hi"), async (frame, snap) => {
    order.push(`fanout:${frame.seq}:${snap.running}`);
    await Promise.resolve();
  });
  const done = ch.publishAsync({ type: "done", data: null }, async (frame) => {
    order.push(`fanout:${frame.seq}`);
    expect(ch.replayAfter(1)).toHaveLength(1);
  });
  await done;
  order.push("settled");
  expect(order).toEqual(["fanout:1:true", "fanout:2", "settled"]);
  expect(ch.replayAfter(1)).toBeNull();
});

test("turnId rides publish end to end (frame and snapshot)", () => {
  const ch = new StreamChannel();
  const frame = ch.publish({ ...user("hi"), turnId: "t-9" }, () => {});
  expect(frame.turnId).toBe("t-9");
  expect(ch.snapshot.turnId).toBe("t-9");
  ch.publish({ type: "done", data: null, turnId: "t-9" }, () => {});
  expect(ch.snapshot.turnId).toBeUndefined();
});
