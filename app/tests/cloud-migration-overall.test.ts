import assert from "node:assert/strict";
import test from "node:test";
import {
  type AgentMigrationProgress,
  computeOverallProgress,
} from "../src/lib/cloud-migration-progress.ts";

/** A progress entry with sensible defaults, overridable per case. */
function prog(over: Partial<AgentMigrationProgress>): AgentMigrationProgress {
  return {
    step: "pending",
    chunkIndex: 0,
    chunkCount: 0,
    rejected: [],
    counts: { written: 0, skipped: 0, rejected: 0, sessionsRebuilt: false },
    ...over,
  };
}

const task = (sourceId: string, totalBytes: number) => ({
  sourceId,
  manifest: { totalBytes },
});

// ── empty plan ────────────────────────────────────────────────────────
test("empty task list is 0", () => {
  assert.equal(computeOverallProgress([], {}), 0);
});

// ── single task through every phase ────────────────────────────────────
test("single task advances monotonically through all phases", () => {
  const cases: Array<[Partial<AgentMigrationProgress>, number]> = [
    [{ step: "pending" }, 0],
    [{ step: "creating" }, 0.1],
    [{ step: "warming" }, 0.25],
    [{ step: "uploading", chunkIndex: 0, chunkCount: 4 }, 0.25],
    [{ step: "uploading", chunkIndex: 2, chunkCount: 4 }, 0.575],
    [{ step: "uploading", chunkIndex: 4, chunkCount: 4 }, 0.9],
    [{ step: "finalizing" }, 0.95],
    [{ step: "done" }, 1],
  ];
  let prev = -1;
  for (const [over, expected] of cases) {
    const value = computeOverallProgress([task("a", 100)], { a: prog(over) });
    assert.ok(Math.abs(value - expected) < 1e-9, `${over.step} → ${value}`);
    assert.ok(value >= prev, `monotonic at ${over.step}`);
    prev = value;
  }
});

// ── chunk fraction math ────────────────────────────────────────────────
test("uploading scales 0.25→0.90 by chunkIndex/chunkCount", () => {
  const at = (i: number, n: number) =>
    computeOverallProgress([task("a", 1)], {
      a: prog({ step: "uploading", chunkIndex: i, chunkCount: n }),
    });
  assert.ok(Math.abs(at(1, 2) - (0.25 + 0.65 * 0.5)) < 1e-9);
  assert.ok(Math.abs(at(3, 10) - (0.25 + 0.65 * 0.3)) < 1e-9);
  // chunkCount 0 (not yet chunked) sits at the band start.
  assert.equal(at(0, 0), 0.25);
  // chunkIndex is clamped to [0, chunkCount].
  assert.equal(at(9, 4), 0.9);
});

// ── error freezes at the failed step's last fraction ───────────────────
test("error counts as the errorStep fraction", () => {
  const warmFail = computeOverallProgress([task("a", 1)], {
    a: prog({ step: "error", errorStep: "warming" }),
  });
  assert.equal(warmFail, 0.25);
  const uploadFail = computeOverallProgress([task("a", 1)], {
    a: prog({
      step: "error",
      errorStep: "uploading",
      chunkIndex: 2,
      chunkCount: 4,
    }),
  });
  assert.ok(Math.abs(uploadFail - 0.575) < 1e-9);
  // Error without a recorded step degrades to 0, never NaN.
  assert.equal(
    computeOverallProgress([task("a", 1)], { a: prog({ step: "error" }) }),
    0,
  );
});

// ── multi-task byte weighting ──────────────────────────────────────────
test("byte weighting favours the larger agent", () => {
  // 300B done + 100B pending ⇒ 0.75 of the bytes are complete.
  const value = computeOverallProgress([task("big", 300), task("small", 100)], {
    big: prog({ step: "done" }),
    small: prog({ step: "pending" }),
  });
  assert.ok(Math.abs(value - 0.75) < 1e-9);
});

test("a task missing from progress counts as pending", () => {
  const value = computeOverallProgress([task("a", 100), task("b", 100)], {
    a: prog({ step: "done" }),
  });
  assert.equal(value, 0.5);
});

// ── zero-byte fallback ─────────────────────────────────────────────────
test("all-zero-byte plan falls back to equal weights", () => {
  const value = computeOverallProgress([task("a", 0), task("b", 0)], {
    a: prog({ step: "done" }),
    b: prog({ step: "pending" }),
  });
  assert.equal(value, 0.5);
});

test("equal-weight fallback still averages per task", () => {
  const value = computeOverallProgress(
    [task("a", 0), task("b", 0), task("c", 0)],
    {
      a: prog({ step: "done" }),
      b: prog({ step: "warming" }),
      c: prog({ step: "pending" }),
    },
  );
  assert.ok(Math.abs(value - (1 + 0.25 + 0) / 3) < 1e-9);
});
