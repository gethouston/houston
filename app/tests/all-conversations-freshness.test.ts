import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  createSliceFreshness,
  foldSweep,
} from "../src/lib/all-conversations-freshness.ts";

const O1 = "7bf0d5bf921ac7d5";
const GHOST = "77b724ee607282cf";
const CEO = "1894c0b8d4212ed0";

const row = (id: string, agent_path: string, status = "needs_you") => ({
  id,
  agent_path,
  status,
});

describe("createSliceFreshness", () => {
  it("names the agents patched at or after the sweep started", () => {
    const freshness = createSliceFreshness();
    freshness.notePatched(O1, 1_000);
    freshness.notePatched(CEO, 500);

    deepStrictEqual(freshness.patchedSince([O1, CEO, GHOST], 900), [O1]);
    deepStrictEqual(freshness.patchedSince([O1, CEO], 1_000), [O1]);
    deepStrictEqual(freshness.patchedSince([O1, CEO], 1_001), []);
  });

  it("keeps the newest stamp when patches land out of order", () => {
    const freshness = createSliceFreshness();
    freshness.notePatched(O1, 2_000);
    freshness.notePatched(O1, 1_000);

    deepStrictEqual(freshness.patchedSince([O1], 1_500), [O1]);
  });

  it("never names an agent that was never patched", () => {
    deepStrictEqual(createSliceFreshness().patchedSince([O1], 0), []);
  });
});

/**
 * The incident shape: a sweep starts right before a mission is created on O1,
 * is held ~15s by a stranded agent that only answers 503, and settles after
 * the mission's reply landed through push-event patches. The sweep's O1 rows
 * are the older snapshot; the patched slice must win.
 */
describe("foldSweep", () => {
  it("carries the patched slice forward over the sweep's older snapshot", () => {
    const sweepSnapshot = [row("buenas", O1, "needs_you"), row("c1", CEO)];
    const cache = [
      row("hola", O1, "needs_you"),
      row("buenas", O1, "needs_you"),
      row("c1", CEO),
      row("g1", GHOST),
    ];

    const merged = foldSweep(sweepSnapshot, cache, [GHOST], [O1]);

    deepStrictEqual(
      merged.map((r) => r.id),
      ["c1", "hola", "buenas", "g1"],
      "CEO fresh, O1 from the newer patch, the ghost carried as a failed agent",
    );
  });

  it("drops the sweep's rows for an overtaken agent even when they carry a newer-looking status", () => {
    // The patch emptied O1's slice (its last mission was archived while the
    // sweep was held). The sweep's stale row must not resurrect it.
    const merged = foldSweep(
      [row("old", O1, "running"), row("c1", CEO)],
      [row("c1", CEO)],
      [],
      [O1],
    );
    deepStrictEqual(
      merged.map((r) => r.id),
      ["c1"],
    );
  });

  it("is mergePartialSweep when nothing was overtaken", () => {
    const fresh = [row("c1", CEO)];
    strictEqual(foldSweep(fresh, [row("g1", GHOST)], [], []), fresh);
    deepStrictEqual(
      foldSweep(fresh, [row("g1", GHOST)], [GHOST], []).map((r) => r.id),
      ["c1", "g1"],
    );
  });

  it("ignores the overtaken list with no cache to carry from", () => {
    // First sweep of the session: the sweep's rows are the ONLY rows for O1;
    // dropping them would blank the agent, not refresh it.
    const fresh = [row("hola", O1)];
    strictEqual(foldSweep(fresh, undefined, [], [O1]), fresh);
  });
});
