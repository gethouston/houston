import { expect, test } from "bun:test";
import type { HoustonEvent } from "@houston/protocol";
import { MemoryTurnBus } from "../turn/bus";
import { BusEventHub } from "./hub";

/**
 * The event hub fans domain changes to a user's subscribers and — the load-
 * bearing property — keeps one tenant's events away from another's, because the
 * channel is keyed by user id.
 */

test("emit reaches the same user's subscriber", async () => {
  const hub = new BusEventHub(new MemoryTurnBus());
  const seen: HoustonEvent[] = [];
  hub.subscribe("alice", (e) => seen.push(e));

  hub.emit("alice", { type: "ActivityChanged", agentPath: "a1" });
  await Promise.resolve(); // let the fire-and-forget publish settle

  expect(seen).toEqual([{ type: "ActivityChanged", agentPath: "a1" }]);
});

test("one user's events never reach another user (per-user channel)", async () => {
  const bus = new MemoryTurnBus();
  const hub = new BusEventHub(bus);
  const alice: HoustonEvent[] = [];
  const bob: HoustonEvent[] = [];
  hub.subscribe("alice", (e) => alice.push(e));
  hub.subscribe("bob", (e) => bob.push(e));

  hub.emit("alice", { type: "SkillsChanged", agentPath: "a1" });
  hub.emit("bob", { type: "RoutinesChanged", agentPath: "b1" });
  await Promise.resolve();

  expect(alice).toEqual([{ type: "SkillsChanged", agentPath: "a1" }]);
  expect(bob).toEqual([{ type: "RoutinesChanged", agentPath: "b1" }]);
});

test("unsubscribe stops delivery", async () => {
  const hub = new BusEventHub(new MemoryTurnBus());
  const seen: HoustonEvent[] = [];
  const off = hub.subscribe("alice", (e) => seen.push(e));
  off();
  hub.emit("alice", { type: "ConfigChanged", agentPath: "a1" });
  await Promise.resolve();
  expect(seen).toEqual([]);
});

test("a malformed frame on the bus is dropped, not thrown to the subscriber", async () => {
  const bus = new MemoryTurnBus();
  const hub = new BusEventHub(bus);
  const seen: HoustonEvent[] = [];
  hub.subscribe("alice", (e) => seen.push(e));

  // A non-JSON frame published directly to the user's channel must not throw.
  await bus.publish("events:alice", "not json{{{");
  hub.emit("alice", { type: "FilesChanged", agentPath: "a1" });
  await Promise.resolve();

  expect(seen).toEqual([{ type: "FilesChanged", agentPath: "a1" }]);
});
