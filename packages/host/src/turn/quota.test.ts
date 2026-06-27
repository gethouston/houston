import { expect, test } from "bun:test";
import { MemoryTurnBus } from "./bus";
import { TurnQuota, TurnQuotaError } from "./quota";

test("concurrent cap per workspace; other workspaces unaffected", async () => {
  const q = new TurnQuota({ maxConcurrent: 2, perHour: 100 });
  const r1 = await q.acquire("ws-1");
  await q.acquire("ws-1");
  expect(q.acquire("ws-1")).rejects.toThrow(TurnQuotaError);
  expect(q.acquire("ws-2")).resolves.toBeDefined();
  await r1();
  expect(q.acquire("ws-1")).resolves.toBeDefined();
});

test("per-hour cap refills in the next hour window", async () => {
  let t = 0;
  const q = new TurnQuota({ maxConcurrent: 100, perHour: 2 }, { now: () => t });
  await (await q.acquire("ws-1"))();
  await (await q.acquire("ws-1"))();
  expect(q.acquire("ws-1")).rejects.toThrow(/per hour/);
  t += 3_600_001;
  expect(q.acquire("ws-1")).resolves.toBeDefined();
});

test("a rejected attempt does not consume the hourly budget", async () => {
  const q = new TurnQuota({ maxConcurrent: 1, perHour: 3 });
  const r1 = await q.acquire("ws-1"); // hourly slot 1
  await expect(q.acquire("ws-1")).rejects.toThrow(TurnQuotaError); // concurrent reject — no hourly cost
  await r1();
  // Slots 2 and 3 must still be claimable (the reject above didn't burn one).
  await (await q.acquire("ws-1"))();
  await (await q.acquire("ws-1"))();
  await expect(q.acquire("ws-1")).rejects.toThrow(/per hour/);
});

test("double release is a no-op", async () => {
  const q = new TurnQuota({ maxConcurrent: 1, perHour: 100 });
  const release = await q.acquire("ws-1");
  await release();
  await release();
  await q.acquire("ws-1");
  expect(q.acquire("ws-1")).rejects.toThrow(TurnQuotaError);
});

test("the cap holds ACROSS replicas sharing one bus", async () => {
  const bus = new MemoryTurnBus();
  const replicaA = new TurnQuota({ maxConcurrent: 2, perHour: 100 }, { bus });
  const replicaB = new TurnQuota({ maxConcurrent: 2, perHour: 100 }, { bus });
  const r1 = await replicaA.acquire("ws-1");
  await replicaB.acquire("ws-1");
  // Third concurrent turn rejected no matter which replica it lands on.
  expect(replicaA.acquire("ws-1")).rejects.toThrow(TurnQuotaError);
  expect(replicaB.acquire("ws-1")).rejects.toThrow(TurnQuotaError);
  await r1();
  expect(replicaB.acquire("ws-1")).resolves.toBeDefined();
});
