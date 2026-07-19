import assert from "node:assert/strict";
import test from "node:test";
import { runWithConcurrency } from "../src/lib/cloud-migration-pool.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test("runs every item exactly once", async () => {
  const seen: number[] = [];
  await runWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
    seen.push(n);
  });
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5]);
});

test("never exceeds the concurrency cap", async () => {
  let active = 0;
  let maxActive = 0;
  await runWithConcurrency([1, 2, 3, 4, 5, 6], 3, async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(5);
    active--;
  });
  assert.equal(maxActive, 3);
});

test("a slow item never blocks the others (isolation)", async () => {
  const finished: string[] = [];
  await runWithConcurrency(
    [
      { id: "slow", ms: 40 },
      { id: "a", ms: 1 },
      { id: "b", ms: 1 },
      { id: "c", ms: 1 },
    ],
    2,
    async (item) => {
      await sleep(item.ms);
      finished.push(item.id);
    },
  );
  // Everything completed, and the quick items landed before the slow one.
  assert.deepEqual([...finished].sort(), ["a", "b", "c", "slow"]);
  assert.equal(finished[finished.length - 1], "slow");
});

test("shouldStop halts new pickups while the in-flight item finishes", async () => {
  const ran: number[] = [];
  let stopped = false;
  await runWithConcurrency(
    [1, 2, 3, 4],
    1,
    async (n) => {
      ran.push(n);
      stopped = true; // the user hit "Migrate later" mid-item
    },
    () => stopped,
  );
  assert.deepEqual(ran, [1]);
});

test("a limit above the item count still completes cleanly", async () => {
  const ran: number[] = [];
  await runWithConcurrency([1, 2], 8, async (n) => {
    ran.push(n);
  });
  assert.deepEqual([...ran].sort(), [1, 2]);
});
