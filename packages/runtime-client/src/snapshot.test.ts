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
  expect(s).toEqual({
    running: true,
    partial: "Hello",
    seq: 4,
    tools: [{ name: "ls", input: {} }],
  });
  s = reduceSnapshot(s, { type: "done", data: null, seq: 5 });
  // Turn over, watermark kept — the counter outlives the turn.
  expect(s).toEqual({ running: false, partial: "", seq: 5 });
});

test("thinking + tools accumulate for the running turn and reset on the next (HOU-717)", () => {
  let s = reduceSnapshot(EMPTY_SNAPSHOT, {
    type: "user",
    data: { content: "go", ts: 1 },
    seq: 1,
  });
  s = reduceSnapshot(s, { type: "thinking", data: "plan ", seq: 2 });
  s = reduceSnapshot(s, { type: "thinking", data: "steps", seq: 3 });
  s = reduceSnapshot(s, {
    type: "tool_start",
    data: { name: "bash", args: { cmd: "ls" } },
    seq: 4,
  });
  // The started tool is tracked WITHOUT isError — it is still running.
  expect(s).toEqual({
    running: true,
    partial: "",
    seq: 4,
    thinking: "plan steps",
    tools: [{ name: "bash", input: { cmd: "ls" } }],
  });
  s = reduceSnapshot(s, {
    type: "tool_end",
    data: { name: "bash", isError: false, content: "file-a\nfile-b" },
    seq: 5,
  });
  s = reduceSnapshot(s, { type: "text", data: "done", seq: 6 });
  // text carries the activity through; tool_end stamps the ended flag and
  // the output preview.
  expect(s).toEqual({
    running: true,
    partial: "done",
    seq: 6,
    thinking: "plan steps",
    tools: [
      {
        name: "bash",
        input: { cmd: "ls" },
        isError: false,
        content: "file-a\nfile-b",
      },
    ],
  });
  // A NEW turn starts clean: no inherited thinking/tools (and the omitted
  // fields must not serialize).
  s = reduceSnapshot(s, {
    type: "user",
    data: { content: "next", ts: 2 },
    seq: 7,
  });
  expect(s).toEqual({ running: true, partial: "", seq: 7 });
  expect("thinking" in s).toBe(false);
  expect("tools" in s).toBe(false);
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
