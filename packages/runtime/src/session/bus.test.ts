import { expect, test } from "bun:test";
import type { WireEvent } from "@houston/runtime-client";
import {
  publish,
  reduceSnapshot,
  snapshot,
  subscribe,
  subscriberCount,
} from "./bus";

// Unique id per test so the module-level maps never bleed across cases.
let counter = 0;
const freshId = () => `test-conv-${counter++}`;

test("events reach only that conversation's subscribers", () => {
  const a = freshId();
  const b = freshId();
  const aEvents: WireEvent[] = [];
  const bEvents: WireEvent[] = [];
  const unsubA = subscribe(a, (e) => aEvents.push(e));
  const unsubB = subscribe(b, (e) => bEvents.push(e));

  publish(a, { type: "text", data: "hello from A" });

  expect(aEvents).toHaveLength(1);
  expect(bEvents).toHaveLength(0); // the isolation guarantee
  expect(aEvents[0]).toEqual({ type: "text", data: "hello from A" });

  unsubA();
  unsubB();
});

test("two concurrent conversations never cross", () => {
  const a = freshId();
  const b = freshId();
  const aTexts: string[] = [];
  const bTexts: string[] = [];
  subscribe(a, (e) => {
    if (e.type === "text") aTexts.push(e.data);
  });
  subscribe(b, (e) => {
    if (e.type === "text") bTexts.push(e.data);
  });

  publish(a, { type: "text", data: "a1" });
  publish(b, { type: "text", data: "b1" });
  publish(a, { type: "text", data: "a2" });
  publish(b, { type: "text", data: "b2" });

  expect(aTexts).toEqual(["a1", "a2"]);
  expect(bTexts).toEqual(["b1", "b2"]);
});

test("unsubscribe stops delivery and clears the subscriber set", () => {
  const id = freshId();
  const seen: WireEvent[] = [];
  const unsub = subscribe(id, (e) => seen.push(e));
  publish(id, { type: "text", data: "one" });
  unsub();
  publish(id, { type: "text", data: "two" });
  expect(seen).toHaveLength(1);
  expect(subscriberCount(id)).toBe(0);
});

test("snapshot catches a late subscriber up to the in-flight turn", () => {
  const id = freshId();
  publish(id, { type: "user", data: { content: "hi", ts: 1 } });
  publish(id, { type: "text", data: "Hel" });
  publish(id, { type: "text", data: "lo" });

  // A client connecting now is told the turn is running + handed the text so far.
  expect(snapshot(id)).toEqual({ running: true, partial: "Hello" });

  publish(id, { type: "done", data: null });
  expect(snapshot(id)).toEqual({ running: false, partial: "" }); // cleared after the turn
});

test("a new `user` event resets the partial for the next turn", () => {
  const id = freshId();
  publish(id, { type: "user", data: { content: "q1", ts: 1 } });
  publish(id, { type: "text", data: "answer one" });
  publish(id, { type: "done", data: null });
  publish(id, { type: "user", data: { content: "q2", ts: 2 } });
  expect(snapshot(id)).toEqual({ running: true, partial: "" });
});

test("reduceSnapshot keeps the turn running through tool/thinking frames", () => {
  let s = reduceSnapshot(
    { running: false, partial: "" },
    { type: "user", data: { content: "go", ts: 1 } },
  );
  s = reduceSnapshot(s, { type: "text", data: "work" });
  s = reduceSnapshot(s, { type: "tool_start", data: { name: "ls", args: {} } });
  expect(s).toEqual({ running: true, partial: "work" }); // tool frame doesn't touch text
  s = reduceSnapshot(s, {
    type: "tool_end",
    data: { name: "ls", isError: false },
  });
  expect(s.running).toBe(true);
  s = reduceSnapshot(s, { type: "error", data: { message: "boom" } });
  expect(s).toEqual({ running: false, partial: "" });
});

test("a brand-new conversation has an empty snapshot and no subscribers", () => {
  const id = freshId();
  expect(snapshot(id)).toEqual({ running: false, partial: "" });
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
