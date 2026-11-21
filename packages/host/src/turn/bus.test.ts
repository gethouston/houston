import { expect, test } from "vitest";
import { MemoryTurnBus } from "./bus";

test("publish fans out to all subscribers; unsubscribe stops delivery", async () => {
  const bus = new MemoryTurnBus();
  const a: string[] = [];
  const b: string[] = [];
  const unsubA = bus.subscribe("ch", (m) => a.push(m));
  bus.subscribe("ch", (m) => b.push(m));
  await bus.publish("ch", "one");
  unsubA();
  await bus.publish("ch", "two");
  expect(a).toEqual(["one"]);
  expect(b).toEqual(["one", "two"]);
});

test("setNx is a mutex; expire extends; TTL lapses lazily", async () => {
  let t = 0;
  const bus = new MemoryTurnBus(() => t);
  expect(await bus.setNx("lock", "1", 10)).toBe(true);
  expect(await bus.setNx("lock", "1", 10)).toBe(false);
  t += 9_000;
  await bus.expire("lock", 10);
  t += 9_000;
  expect(await bus.setNx("lock", "1", 10)).toBe(false);
  t += 10_001;
  expect(await bus.setNx("lock", "1", 10)).toBe(true);
});

test("incr creates with TTL, counts atomically, decr reverses", async () => {
  let t = 0;
  const bus = new MemoryTurnBus(() => t);
  expect(await bus.incr("n", 60)).toBe(1);
  expect(await bus.incr("n", 60)).toBe(2);
  expect(await bus.decr("n")).toBe(1);
  t += 60_001;
  expect(await bus.incr("n", 60)).toBe(1);
});

test("get/set/del round-trip with TTL", async () => {
  let t = 0;
  const bus = new MemoryTurnBus(() => t);
  await bus.set("k", "v", 5);
  expect(await bus.get("k")).toBe("v");
  t += 5_001;
  expect(await bus.get("k")).toBeNull();
  await bus.set("k", "v2", 5);
  await bus.del("k");
  expect(await bus.get("k")).toBeNull();
});
