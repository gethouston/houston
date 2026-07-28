import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { runPool } from "../src/lib/async-pool.ts";

/** A promise plus its resolver, so a test decides when a task settles. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("runPool", () => {
  it("never runs more than `limit` tasks at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await runPool(items, 4, async (item) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, item % 3));
      inFlight--;
    });

    strictEqual(peak, 4);
    strictEqual(inFlight, 0);
  });

  it("runs every item exactly once, whatever the settle order", async () => {
    const gates = [deferred(), deferred(), deferred()];
    const done: number[] = [];

    const pool = runPool([0, 1, 2], 3, async (i) => {
      await gates[i].promise;
      done.push(i);
    });

    // Settle out of order: results are committed as they land, not batched.
    gates[2].resolve();
    await tick();
    deepStrictEqual(done, [2]);
    gates[0].resolve();
    gates[1].resolve();
    await pool;
    deepStrictEqual(done.slice().sort(), [0, 1, 2]);
  });

  it("stops starting work once the run is superseded", async () => {
    const started: number[] = [];
    let generation = 1;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await runPool(
      items,
      2,
      async (item) => {
        started.push(item);
        // A phrase change lands while the first pair is in flight.
        if (started.length === 2) generation = 2;
        await tick();
      },
      () => generation !== 1,
    );

    deepStrictEqual(started, [0, 1]);
  });

  it("resolves immediately on an empty item list", async () => {
    let ran = 0;
    await runPool([], 4, async () => {
      ran++;
    });
    strictEqual(ran, 0);
  });
});
