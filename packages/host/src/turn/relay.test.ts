import type { SequencedFrame, WireFrame } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { MemoryTurnBus } from "./bus";
import { TurnRelay } from "./relay";

/**
 * The relay is what lets the web keep its subscribe-then-send contract over a
 * single-request turn stream. Pinned here: one turn per agent, snapshot/sync
 * semantics matching the runtime bus, per-conversation seq stamping that stays
 * monotonic across turns AND replicas, replay windows for `?after=` resume,
 * cancellation reads as an error frame, a dead upstream can never leave a
 * client hanging on `running`, and — since the state rides the TurnBus — all
 * of it holds across two relay instances (replicas) sharing one bus.
 */

const drainTick = () => new Promise((r) => setTimeout(r, 0));

test("frames fan out sequenced (1,2,3…) and build the sync snapshot with its watermark", async () => {
  const relay = new TurnRelay();
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));

  let publishFrame!: (e: WireFrame) => Promise<void>;
  let finish!: () => void;
  const turnDone = new Promise<void>((r) => (finish = r));
  await relay.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await turnDone;
  });

  await publishFrame({ type: "user", data: { content: "hi", ts: 1 } });
  await publishFrame({ type: "text", data: "Hello " });
  await publishFrame({ type: "text", data: "world" });
  expect(await relay.snapshot("a1/c1")).toEqual({
    running: true,
    partial: "Hello world",
    seq: 3,
  });
  expect(seen.map((e) => e.seq)).toEqual([1, 2, 3]);

  await publishFrame({ type: "done", data: null });
  // Turn over — running/partial cleared, the seq watermark kept.
  expect(await relay.snapshot("a1/c1")).toEqual({
    running: false,
    partial: "",
    seq: 4,
  });
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
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  await relay.start("a1", "a1/c1", async () => {
    throw new Error("runtime unreachable");
  });
  await drainTick();
  expect(seen).toEqual([
    { type: "error", data: { message: "runtime unreachable" }, seq: 1 },
  ]);
});

test("cancel aborts the pump and reads as a cancelled-turn error", async () => {
  const relay = new TurnRelay();
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  await relay.start("a1", "a1/c1", async (_publish, signal) => {
    await new Promise((_, rej) =>
      signal.addEventListener("abort", () => rej(new Error("aborted")), {
        once: true,
      }),
    );
  });
  expect(await relay.cancel("a1")).toBe(true);
  await drainTick();
  await drainTick();
  expect(seen).toEqual([
    { type: "error", data: { message: "Stopped by user" }, seq: 1 },
  ]);
  expect(await relay.cancel("a1")).toBe(false); // nothing in flight anymore
});

test("an upstream that dies mid-turn synthesizes an error at watermark+1 (client never hangs)", async () => {
  const relay = new TurnRelay();
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  await relay.start("a1", "a1/c1", async (publish) => {
    await publish({ type: "user", data: { content: "hi", ts: 1 } }); // 1
    await publish({ type: "text", data: "partial…" }); // 2
    // resolves with the conversation still marked running — no done/error frame
  });
  await drainTick();
  await drainTick();
  const last = seen[seen.length - 1];
  expect(last).toEqual({
    type: "error",
    data: { message: "The turn ended unexpectedly" },
    seq: 3,
  });
  expect((await relay.snapshot("a1/c1")).running).toBe(false);
});

// ---------------------------------------------------------------------------
// Sequencing: single authority, cross-turn monotonicity, replay windows.
// ---------------------------------------------------------------------------

async function runTurn(
  relay: TurnRelay,
  agentId: string,
  key: string,
  frames: WireFrame[],
): Promise<void> {
  const started = await relay.start(agentId, key, async (publish) => {
    for (const f of frames) await publish(f);
  });
  expect(started).toBe(true);
  await drainTick();
  await drainTick();
}

test("the relay is the ONE sequencing authority: incoming seqs are ignored, never adopted", async () => {
  const relay = new TurnRelay();
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  await runTurn(relay, "a1", "a1/c1", [
    { type: "user", data: { content: "hi", ts: 1 }, seq: 7 }, // re-stamped → 1
    { type: "text", data: "x", seq: 7 }, // duplicate upstream seq → 2, not a re-broadcast
    { type: "text", data: "y" }, // 3
    { type: "done", data: null, seq: 99 }, // re-stamped → 4
  ]);
  expect(seen.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
});

test("turnId rides the relay: pumped frames, the snapshot, and the sync read-out", async () => {
  const relay = new TurnRelay();
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  let publishFrame!: (e: WireFrame) => Promise<void>;
  let finish!: () => void;
  await relay.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await new Promise<void>((r) => (finish = r));
  });
  await publishFrame({
    type: "user",
    data: { content: "hi", ts: 1 },
    turnId: "t-1",
  });
  await publishFrame({ type: "text", data: "x", turnId: "t-1" });
  expect(seen.map((e) => e.turnId)).toEqual(["t-1", "t-1"]);
  expect(await relay.snapshot("a1/c1")).toEqual({
    running: true,
    partial: "x",
    seq: 2,
    turnId: "t-1",
  });
  await publishFrame({ type: "done", data: null, turnId: "t-1" });
  expect((await relay.snapshot("a1/c1")).turnId).toBeUndefined();
  finish();
  await drainTick();
});

test("the pump-death error carries the turnId of the turn it terminates", async () => {
  const relay = new TurnRelay();
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  await relay.start("a1", "a1/c1", async (publish) => {
    await publish({
      type: "user",
      data: { content: "hi", ts: 1 },
      turnId: "t-dead",
    });
    // resolves still running — no terminal frame
  });
  await drainTick();
  await drainTick();
  const last = seen[seen.length - 1];
  expect(last).toEqual({
    type: "error",
    data: { message: "The turn ended unexpectedly" },
    seq: 2,
    turnId: "t-dead",
  });
});

test("seq continues across turns — even when the next turn runs on another replica", async () => {
  const bus = new MemoryTurnBus();
  const replicaA = new TurnRelay(bus);
  const replicaB = new TurnRelay(bus);
  const seen: SequencedFrame[] = [];
  replicaB.subscribe("a1/c1", (e) => seen.push(e));

  await runTurn(replicaA, "a1", "a1/c1", [
    { type: "user", data: { content: "q1", ts: 1 } },
    { type: "done", data: null },
  ]); // 1, 2
  await runTurn(replicaB, "a1", "a1/c1", [
    { type: "user", data: { content: "q2", ts: 2 } },
    { type: "done", data: null },
  ]); // must continue: 3, 4
  expect(seen.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  expect((await replicaA.snapshot("a1/c1")).seq).toBe(4);
});

test("replayAfter serves the owning replica's in-flight window; terminal clears it", async () => {
  const relay = new TurnRelay();
  let publishFrame!: (e: WireFrame) => Promise<void>;
  let finish!: () => void;
  await relay.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await new Promise<void>((r) => (finish = r));
  });
  await publishFrame({ type: "user", data: { content: "hi", ts: 1 } }); // 1
  await publishFrame({ type: "text", data: "Hel" }); // 2
  await publishFrame({ type: "text", data: "lo" }); // 3

  expect(await relay.replayAfter("a1/c1", 1)).toEqual([
    { type: "text", data: "Hel", seq: 2 },
    { type: "text", data: "lo", seq: 3 },
  ]);
  expect(await relay.replayAfter("a1/c1", 3)).toEqual([]);
  expect(await relay.replayAfter("a1/c1", 9)).toBeNull();

  await publishFrame({ type: "done", data: null }); // 4 → window cleared
  expect(await relay.replayAfter("a1/c1", 2)).toBeNull(); // resync + history refetch
  finish();
  await drainTick();
});

test("replayAfter on a non-owning replica: only an at-watermark cursor is serviceable", async () => {
  const bus = new MemoryTurnBus();
  const replicaA = new TurnRelay(bus);
  const replicaB = new TurnRelay(bus);
  let publishFrame!: (e: WireFrame) => Promise<void>;
  let finish!: () => void;
  await replicaA.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await new Promise<void>((r) => (finish = r));
  });
  await publishFrame({ type: "user", data: { content: "hi", ts: 1 } }); // 1
  await publishFrame({ type: "text", data: "x" }); // 2

  expect(await replicaB.replayAfter("a1/c1", 2)).toEqual([]); // caught up → live-only
  expect(await replicaB.replayAfter("a1/c1", 1)).toBeNull(); // buffer lives on A → resync
  finish();
  await drainTick();
});

// ---------------------------------------------------------------------------
// Dead-pump reaper: a running snapshot with no lease is a crashed pump.
// ---------------------------------------------------------------------------

/** Crash-sim: persist a running snapshot with NO inflight lease (the state a
 *  SIGKILL'd pump owner leaves behind once its lease TTL lapses). */
async function simulateCrashedTurn(bus: MemoryTurnBus, key: string) {
  await bus.set(
    `turn:snap2:${key}`,
    JSON.stringify({
      running: true,
      partial: "half an ans",
      seq: 5,
      turnId: "t-dead",
    }),
    3600,
  );
}

test("reaper: synthesizes the dead turn's terminal error and heals the snapshot", async () => {
  const bus = new MemoryTurnBus();
  const relay = new TurnRelay(bus);
  await simulateCrashedTurn(bus, "a1/c1");
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));

  expect(await relay.reapIfDead("a1", "a1/c1")).toBe(true);

  // The synthesized terminal: watermark+1, carrying the DEAD turn's id, and
  // broadcast through the normal channel (subscribers on every replica see it).
  expect(seen).toEqual([
    {
      type: "error",
      data: { message: "The turn ended unexpectedly" },
      seq: 6,
      turnId: "t-dead",
    },
  ]);
  // A fresh connect is now served against the healed state.
  expect(await relay.snapshot("a1/c1")).toEqual({
    running: false,
    partial: "",
    seq: 6,
  });
  // A resume parked at the dead turn's watermark gets the synthesized frame.
  expect(await relay.replayAfter("a1/c1", 5)).toEqual([
    {
      type: "error",
      data: { message: "The turn ended unexpectedly" },
      seq: 6,
      turnId: "t-dead",
    },
  ]);
  expect(await relay.replayAfter("a1/c1", 6)).toEqual([]); // caught up
});

test("reaper: leaves a live turn alone (lease held) and an idle conversation alone", async () => {
  const bus = new MemoryTurnBus();
  const relay = new TurnRelay(bus);

  // Idle: nothing persisted → nothing to reap.
  expect(await relay.reapIfDead("a1", "a1/c1")).toBe(false);

  // Live: a genuinely-running turn holds the agent's lease (created before the
  // snapshot ever flips to running) — never reaped.
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  let publishFrame!: (e: WireFrame) => Promise<void>;
  let finish!: () => void;
  await relay.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await new Promise<void>((r) => (finish = r));
  });
  await publishFrame({
    type: "user",
    data: { content: "hi", ts: 1 },
    turnId: "t-live",
  });
  expect(await relay.reapIfDead("a1", "a1/c1")).toBe(false);
  // Also from ANOTHER replica sharing the bus: the lease is global state.
  expect(await new TurnRelay(bus).reapIfDead("a1", "a1/c1")).toBe(false);
  expect(seen.filter((f) => f.type === "error")).toHaveLength(0);
  finish();
  await drainTick();
});

test("reaper: concurrent connects share one heal — the dead turn dies exactly once", async () => {
  const bus = new MemoryTurnBus();
  const relay = new TurnRelay(bus);
  await simulateCrashedTurn(bus, "a1/c1");
  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));

  const results = await Promise.all([
    relay.reapIfDead("a1", "a1/c1"),
    relay.reapIfDead("a1", "a1/c1"),
    relay.reapIfDead("a1", "a1/c1"),
  ]);
  expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
  expect(seen).toHaveLength(1); // ONE synthesized terminal, not three
  // And once healed, later connects find nothing to reap.
  expect(await relay.reapIfDead("a1", "a1/c1")).toBe(false);
});

test("reaper: the healed stream keeps sequencing correctly on the next real turn", async () => {
  const bus = new MemoryTurnBus();
  const relay = new TurnRelay(bus);
  await simulateCrashedTurn(bus, "a1/c1"); // seq 5
  await relay.reapIfDead("a1", "a1/c1"); // heal → seq 6

  const seen: SequencedFrame[] = [];
  relay.subscribe("a1/c1", (e) => seen.push(e));
  await runTurn(relay, "a1", "a1/c1", [
    { type: "user", data: { content: "again", ts: 2 }, turnId: "t-next" },
    { type: "done", data: null, turnId: "t-next" },
  ]);
  expect(seen.map((f) => f.seq)).toEqual([7, 8]); // continues past the heal
  // The heal's mini replay window is inert once the stream moved on.
  expect(await relay.replayAfter("a1/c1", 5)).toBeNull();
});

// ---------------------------------------------------------------------------
// Replica-safety: two relay instances sharing one bus behave as one relay.
// ---------------------------------------------------------------------------

test("a subscriber on replica B receives a turn pumped on replica A", async () => {
  const bus = new MemoryTurnBus();
  const replicaA = new TurnRelay(bus);
  const replicaB = new TurnRelay(bus);

  const seenOnB: SequencedFrame[] = [];
  replicaB.subscribe("a1/c1", (e) => seenOnB.push(e));

  let publishFrame!: (e: WireFrame) => Promise<void>;
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

  // The snapshot (with its seq watermark) is readable from replica B.
  const snapB = await replicaB.snapshot("a1/c1");
  expect(snapB).toEqual({
    running: true,
    partial: "streamed across replicas",
    seq: 2,
  });

  await publishFrame({ type: "done", data: null });
  finish();
  await drainTick();
  expect(await replicaB.busy("a1")).toBe(false);
});

test("cancel from replica B aborts a turn owned by replica A", async () => {
  const bus = new MemoryTurnBus();
  const replicaA = new TurnRelay(bus);
  const replicaB = new TurnRelay(bus);

  const seen: SequencedFrame[] = [];
  replicaB.subscribe("a1/c1", (e) => seen.push(e));
  await replicaA.start("a1", "a1/c1", async (_publish, signal) => {
    await new Promise((_, rej) =>
      signal.addEventListener("abort", () => rej(new Error("aborted")), {
        once: true,
      }),
    );
  });

  expect(await replicaB.cancel("a1")).toBe(true);
  await drainTick();
  await drainTick();
  expect(seen).toEqual([
    { type: "error", data: { message: "Stopped by user" }, seq: 1 },
  ]);
});
