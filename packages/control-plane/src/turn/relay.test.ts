import { test, expect } from "bun:test";
import type { WireEvent } from "@houston/runtime-client";
import { MemoryTurnBus } from "./bus";
import { TurnRelay } from "./relay";

/**
 * The relay is what lets the web keep its subscribe-then-send contract over a
 * single-request turn stream. Pinned here: one turn per agent, snapshot/sync
 * semantics matching the runtime bus, cancellation reads as an error frame,
 * a dead upstream can never leave a client hanging on `running`, and — since
 * the state rides the TurnBus — all of it holds across two relay instances
 * (replicas) sharing one bus.
 */

const drainTick = () => new Promise((r) => setTimeout(r, 0));

test("frames fan out to subscribers and build the sync snapshot", async () => {
  const relay = new TurnRelay();
  const seen: WireEvent[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));

  let publishFrame!: (e: WireEvent) => Promise<void>;
  let finish!: () => void;
  const turnDone = new Promise<void>((r) => (finish = r));
  await relay.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await turnDone;
  });

  await publishFrame({ type: "user", data: { content: "hi", ts: 1 } });
  await publishFrame({ type: "text", data: "Hello " });
  await publishFrame({ type: "text", data: "world" });
  expect((await relay.snapshot("a1/c1")).snapshot).toEqual({ running: true, partial: "Hello world" });
  expect(seen).toHaveLength(3);

  await publishFrame({ type: "done", data: null });
  expect((await relay.snapshot("a1/c1")).snapshot).toEqual({ running: false, partial: "" });
  finish();
  await drainTick();
  expect(await relay.busy("a1")).toBe(false);
});

test("one turn per agent: a second start returns false; other agents unaffected", async () => {
  const relay = new TurnRelay();
  let finish!: () => void;
  await relay.start("a1", "a1/c1", () => new Promise((r) => (finish = r)));
  expect(await relay.start("a1", "a1/c2", async () => {})).toBe(false);
  expect(await relay.start("a2", "a2/c1", async () => {})).toBe(true);
  finish();
  await drainTick();
  expect(await relay.start("a1", "a1/c2", async () => {})).toBe(true);
});

test("a thrown pump surfaces as an error frame, never silently", async () => {
  const relay = new TurnRelay();
  const seen: WireEvent[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  await relay.start("a1", "a1/c1", async () => {
    throw new Error("runtime unreachable");
  });
  await drainTick();
  expect(seen).toEqual([{ type: "error", data: { message: "runtime unreachable" } }]);
});

test("cancel aborts the pump and reads as a cancelled-turn error", async () => {
  const relay = new TurnRelay();
  const seen: WireEvent[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  await relay.start("a1", "a1/c1", async (_publish, signal) => {
    await new Promise((_, rej) =>
      signal.addEventListener("abort", () => rej(new Error("aborted")), { once: true }),
    );
  });
  expect(await relay.cancel("a1")).toBe(true);
  await drainTick();
  await drainTick();
  expect(seen).toEqual([{ type: "error", data: { message: "Turn cancelled" } }]);
  expect(await relay.cancel("a1")).toBe(false); // nothing in flight anymore
});

test("an upstream that dies mid-turn synthesizes an error (client never hangs)", async () => {
  const relay = new TurnRelay();
  const seen: WireEvent[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  await relay.start("a1", "a1/c1", async (publish) => {
    await publish({ type: "user", data: { content: "hi", ts: 1 } });
    await publish({ type: "text", data: "partial…" });
    // resolves with the conversation still marked running — no done/error frame
  });
  await drainTick();
  await drainTick();
  const last = seen[seen.length - 1];
  expect(last).toEqual({ type: "error", data: { message: "The turn ended unexpectedly" } });
  expect((await relay.snapshot("a1/c1")).snapshot.running).toBe(false);
});

// ---------------------------------------------------------------------------
// Replica-safety: two relay instances sharing one bus behave as one relay.
// ---------------------------------------------------------------------------

test("a subscriber on replica B receives a turn pumped on replica A", async () => {
  const bus = new MemoryTurnBus();
  const replicaA = new TurnRelay(bus);
  const replicaB = new TurnRelay(bus);

  const seenOnB: WireEvent[] = [];
  replicaB.subscribe("a1/c1", (e) => seenOnB.push(e));

  let publishFrame!: (e: WireEvent) => Promise<void>;
  let finish!: () => void;
  await replicaA.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await new Promise<void>((r) => (finish = r));
  });

  // The inflight gate is shared: replica B refuses a second turn.
  expect(await replicaB.start("a1", "a1/c2", async () => {})).toBe(false);
  expect(await replicaB.busy("a1")).toBe(true);

  await publishFrame({ type: "user", data: { content: "hi", ts: 1 } });
  await publishFrame({ type: "text", data: "streamed across replicas" });
  expect(seenOnB).toHaveLength(2);

  // The snapshot (with its turnId/seq watermark) is readable from replica B.
  const snapB = await replicaB.snapshot("a1/c1");
  expect(snapB.snapshot).toEqual({ running: true, partial: "streamed across replicas" });
  expect(snapB.seq).toBe(2);
  expect(snapB.turnId).not.toBe("");

  await publishFrame({ type: "done", data: null });
  finish();
  await drainTick();
  expect(await replicaB.busy("a1")).toBe(false);
});

test("cancel from replica B aborts a turn owned by replica A", async () => {
  const bus = new MemoryTurnBus();
  const replicaA = new TurnRelay(bus);
  const replicaB = new TurnRelay(bus);

  const seen: WireEvent[] = [];
  replicaB.subscribe("a1/c1", (e) => seen.push(e));
  await replicaA.start("a1", "a1/c1", async (_publish, signal) => {
    await new Promise((_, rej) =>
      signal.addEventListener("abort", () => rej(new Error("aborted")), { once: true }),
    );
  });

  expect(await replicaB.cancel("a1")).toBe(true);
  await drainTick();
  await drainTick();
  expect(seen).toEqual([{ type: "error", data: { message: "Turn cancelled" } }]);
});
