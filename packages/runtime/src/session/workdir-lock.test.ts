import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { withWorkdirLock } from "./workdir-lock";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "houston-workdir-lock-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("second acquire waits until the first holder releases", async () => {
  const order: string[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });

  const first = withWorkdirLock(dir, async () => {
    order.push("first-start");
    await gate;
    order.push("first-end");
  });
  const second = withWorkdirLock(dir, async () => {
    order.push("second");
  });

  await sleep(20);
  expect(order).toEqual(["first-start"]); // second must not have run yet

  release();
  await Promise.all([first, second]);
  expect(order).toEqual(["first-start", "first-end", "second"]);
});

test("different workdirs never contend", async () => {
  const other = mkdtempSync(join(tmpdir(), "houston-workdir-lock-b-"));
  try {
    let firstRunning = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const first = withWorkdirLock(dir, async () => {
      firstRunning = true;
      await gate;
    });
    // The other folder acquires immediately even while `dir` is held.
    await withWorkdirLock(other, async () => {
      expect(firstRunning).toBe(true);
    });
    release();
    await first;
  } finally {
    rmSync(other, { recursive: true, force: true });
  }
});

test("equivalent paths canonicalize to the same lock", async () => {
  const order: string[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });

  const first = withWorkdirLock(dir, async () => {
    order.push("first");
    await gate;
  });
  const second = withWorkdirLock(join(dir, "."), async () => {
    order.push("second");
  });

  await sleep(20);
  expect(order).toEqual(["first"]);
  release();
  await Promise.all([first, second]);
  expect(order).toEqual(["first", "second"]);
});

test("a rejected turn releases the lock and surfaces its error", async () => {
  const boom = withWorkdirLock(dir, async () => {
    throw new Error("boom");
  });
  await expect(boom).rejects.toThrow("boom");
  // The folder is not wedged: the next turn runs.
  await expect(withWorkdirLock(dir, async () => "ok")).resolves.toBe("ok");
});
