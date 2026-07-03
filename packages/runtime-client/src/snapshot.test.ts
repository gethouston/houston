import { expect, test } from "vitest";
import { EMPTY_SNAPSHOT, reduceSnapshot } from "./snapshot";

/**
 * The snapshot's seq is the stream watermark: it advances with every folded
 * frame — through tool/thinking noise, provider switches, AND the terminal
 * frames — so a `sync` built from it always names the stream's true position.
 */

test("seq follows the folded frames' seq, including through the terminal frame", () => {
  let s = reduceSnapshot(EMPTY_SNAPSHOT, {
    type: "user",
    data: { content: "go", ts: 1 },
    seq: 1,
  });
  expect(s).toEqual({ running: true, partial: "", seq: 1 });
  s = reduceSnapshot(s, { type: "text", data: "Hel", seq: 2 });
  s = reduceSnapshot(s, { type: "text", data: "lo", seq: 3 });
  expect(s).toEqual({ running: true, partial: "Hello", seq: 3 });
  s = reduceSnapshot(s, {
    type: "tool_start",
    data: { name: "ls", args: {} },
    seq: 4,
  });
  expect(s).toEqual({ running: true, partial: "Hello", seq: 4 });
  s = reduceSnapshot(s, { type: "done", data: null, seq: 5 });
  // Turn over, watermark kept — the counter outlives the turn.
  expect(s).toEqual({ running: false, partial: "", seq: 5 });
});

test("an unsequenced event keeps the previous watermark", () => {
  const s = reduceSnapshot(
    { running: true, partial: "x", seq: 7 },
    { type: "text", data: "y" },
  );
  expect(s).toEqual({ running: true, partial: "xy", seq: 7 });
});

test("provider_switched advances seq without touching running/partial", () => {
  const s = reduceSnapshot(
    { running: true, partial: "so far", seq: 3 },
    {
      type: "provider_switched",
      data: { provider: "p", summarized: false },
      seq: 4,
    },
  );
  expect(s).toEqual({ running: true, partial: "so far", seq: 4 });
});

test("turnId: adopted from the user frame, carried while running, dropped at terminal", () => {
  let s = reduceSnapshot(EMPTY_SNAPSHOT, {
    type: "user",
    data: { content: "go", ts: 1 },
    seq: 1,
    turnId: "t-1",
  });
  expect(s.turnId).toBe("t-1");
  // Carried through frames even when they don't repeat it (legacy-safe).
  s = reduceSnapshot(s, { type: "text", data: "x", seq: 2 });
  expect(s.turnId).toBe("t-1");
  s = reduceSnapshot(s, {
    type: "tool_start",
    data: { name: "ls", args: {} },
    seq: 3,
    turnId: "t-1",
  });
  expect(s.turnId).toBe("t-1");
  s = reduceSnapshot(s, { type: "done", data: null, seq: 4, turnId: "t-1" });
  // Idle again: no running turn, no turnId (and it must not serialize).
  expect(s).toEqual({ running: false, partial: "", seq: 4 });
  expect("turnId" in s).toBe(false);
});

test("turnId: a new user frame REPLACES the previous turn's id, never inherits it", () => {
  const prev = { running: true, partial: "old", seq: 5, turnId: "t-old" };
  const s = reduceSnapshot(prev, {
    type: "user",
    data: { content: "next", ts: 2 },
    seq: 6,
  });
  // The new turn's frame carried no id (legacy writer) → the snapshot must not
  // claim the OLD turn is the running one.
  expect(s).toEqual({ running: true, partial: "", seq: 6 });
});

test("sync is a read-out and never folds back in", () => {
  const prev = { running: true, partial: "x", seq: 9 };
  expect(
    reduceSnapshot(prev, {
      type: "sync",
      data: { running: false, partial: "", seq: 99 },
      seq: 99,
    }),
  ).toBe(prev);
});
