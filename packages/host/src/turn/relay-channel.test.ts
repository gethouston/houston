import type { SequencedFrame } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { MemoryTurnBus } from "./bus";
import { RelayChannels } from "./relay-channel";
import { parseSnapshot } from "./relay-dialect";

/**
 * The relay's stream-state layer in isolation: the v2 bus dialect (versioned
 * names so a mixed-version fleet never cross-feeds payload shapes), the
 * defensive snapshot decoder, and the defensive publish path (a publish on an
 * unopened channel must continue the persisted stream, not clobber it).
 */

test("bus names are dialect-versioned: v2 keys/channels, never the v1 names", async () => {
  const bus = new MemoryTurnBus();
  const channels = new RelayChannels(bus);
  const v1Frames: string[] = [];
  const v2Frames: string[] = [];
  bus.subscribe("turn:ev:a1/c1", (m) => v1Frames.push(m));
  bus.subscribe("turn:ev2:a1/c1", (m) => v2Frames.push(m));

  await channels.open("a1/c1");
  await channels.publish("a1/c1", { type: "text", data: "x" });

  expect(v2Frames).toHaveLength(1);
  expect(v1Frames).toHaveLength(0); // old replicas keep v1 to themselves
  expect(await bus.get("turn:snap2:a1/c1")).not.toBeNull();
  expect(await bus.get("turn:snap:a1/c1")).toBeNull();
});

test("parseSnapshot accepts only a well-formed snapshot; everything else is EMPTY", () => {
  expect(
    parseSnapshot(
      JSON.stringify({ running: true, partial: "p", seq: 3, turnId: "t-1" }),
    ),
  ).toEqual({ running: true, partial: "p", seq: 3, turnId: "t-1" });
  expect(
    parseSnapshot(JSON.stringify({ running: false, partial: "", seq: 0 })),
  ).toEqual({ running: false, partial: "", seq: 0 });

  const empty = { running: false, partial: "", seq: 0 };
  expect(parseSnapshot(null)).toEqual(empty);
  expect(parseSnapshot("not json {")).toEqual(empty);
  expect(parseSnapshot(JSON.stringify(null))).toEqual(empty);
  expect(parseSnapshot(JSON.stringify("string"))).toEqual(empty);
  // The v1 dialect's shape ({turnId,seq,snapshot}) must not be mistaken for v2.
  expect(
    parseSnapshot(
      JSON.stringify({ turnId: "t", seq: 2, snapshot: { running: true } }),
    ),
  ).toEqual(empty);
  expect(
    parseSnapshot(JSON.stringify({ running: "yes", partial: "", seq: 1 })),
  ).toEqual(empty);
  expect(
    parseSnapshot(JSON.stringify({ running: true, partial: "", seq: -1 })),
  ).toEqual(empty);
  expect(
    parseSnapshot(JSON.stringify({ running: true, partial: "", seq: 1.5 })),
  ).toEqual(empty);
  expect(
    parseSnapshot(
      JSON.stringify({ running: true, partial: "", seq: 1, turnId: 42 }),
    ),
  ).toEqual(empty);
});

test("a corrupt persisted snapshot degrades to EMPTY (resync), never a poisoned cast", async () => {
  const bus = new MemoryTurnBus();
  await bus.set("turn:snap2:a1/c1", '{"garbage":', 3600);
  const channels = new RelayChannels(bus);
  expect(await channels.snapshot("a1/c1")).toEqual({
    running: false,
    partial: "",
    seq: 0,
  });
  expect(await channels.replayAfter("a1/c1", 3)).toBeNull(); // → resync
});

test("publish on an unopened channel seeds from the persisted snapshot — the watermark is never clobbered", async () => {
  const bus = new MemoryTurnBus();
  const channels = new RelayChannels(bus);
  await bus.set(
    "turn:snap2:a1/c1",
    JSON.stringify({ running: false, partial: "", seq: 41 }),
    3600,
  );
  const seen: SequencedFrame[] = [];
  channels.subscribe("a1/c1", (f) => seen.push(f));

  // Defensive branch: no open() ran (publish outside a started turn).
  await channels.publish("a1/c1", {
    type: "error",
    data: { message: "stray" },
  });

  expect(seen.map((f) => f.seq)).toEqual([42]); // continues, not a restart at 1
  expect((await channels.snapshot("a1/c1")).seq).toBe(42); // persisted watermark intact
});
