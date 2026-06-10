import { test, expect } from "bun:test";
import type { WireEvent } from "@houston/runtime-client";
import { TurnRelay } from "./relay";

/**
 * The relay is what lets the web keep its subscribe-then-send contract over a
 * single-request turn stream. Pinned here: one turn per agent, snapshot/sync
 * semantics matching the runtime bus, cancellation reads as an error frame,
 * and a dead upstream can never leave a client hanging on `running`.
 */

const drainTick = () => new Promise((r) => setTimeout(r, 0));

test("frames fan out to subscribers and build the sync snapshot", async () => {
  const relay = new TurnRelay();
  const seen: WireEvent[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));

  let publishFrame!: (e: WireEvent) => void;
  let finish!: () => void;
  const turnDone = new Promise<void>((r) => (finish = r));
  relay.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await turnDone;
  });

  publishFrame({ type: "user", data: { content: "hi", ts: 1 } });
  publishFrame({ type: "text", data: "Hello " });
  publishFrame({ type: "text", data: "world" });
  expect(relay.snapshot("a1/c1")).toEqual({ running: true, partial: "Hello world" });
  expect(seen).toHaveLength(3);

  publishFrame({ type: "done", data: null });
  expect(relay.snapshot("a1/c1")).toEqual({ running: false, partial: "" });
  finish();
  await drainTick();
  expect(relay.busy("a1")).toBe(false);
});

test("one turn per agent: a second start returns false; other agents unaffected", async () => {
  const relay = new TurnRelay();
  let finish!: () => void;
  relay.start("a1", "a1/c1", () => new Promise((r) => (finish = r)));
  expect(relay.start("a1", "a1/c2", async () => {})).toBe(false);
  expect(relay.start("a2", "a2/c1", async () => {})).toBe(true);
  finish();
  await drainTick();
  expect(relay.start("a1", "a1/c2", async () => {})).toBe(true);
});

test("a thrown pump surfaces as an error frame, never silently", async () => {
  const relay = new TurnRelay();
  const seen: WireEvent[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  relay.start("a1", "a1/c1", async () => {
    throw new Error("runtime unreachable");
  });
  await drainTick();
  expect(seen).toEqual([{ type: "error", data: { message: "runtime unreachable" } }]);
});

test("cancel aborts the pump and reads as a cancelled-turn error", async () => {
  const relay = new TurnRelay();
  const seen: WireEvent[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  relay.start("a1", "a1/c1", async (_publish, signal) => {
    await new Promise((_, rej) =>
      signal.addEventListener("abort", () => rej(new Error("aborted")), { once: true }),
    );
  });
  expect(relay.cancel("a1")).toBe(true);
  await drainTick();
  expect(seen).toEqual([{ type: "error", data: { message: "Turn cancelled" } }]);
  expect(relay.cancel("a1")).toBe(false); // nothing in flight anymore
});

test("an upstream that dies mid-turn synthesizes an error (client never hangs)", async () => {
  const relay = new TurnRelay();
  const seen: WireEvent[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  relay.start("a1", "a1/c1", async (publish) => {
    publish({ type: "user", data: { content: "hi", ts: 1 } });
    publish({ type: "text", data: "partial…" });
    // resolves with the conversation still marked running — no done/error frame
  });
  await drainTick();
  const last = seen[seen.length - 1];
  expect(last).toEqual({ type: "error", data: { message: "The turn ended unexpectedly" } });
  expect(relay.snapshot("a1/c1").running).toBe(false);
});
