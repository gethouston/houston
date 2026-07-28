import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  mergePartialSweep,
  PARTIAL_SWEEP_RETRY_DELAYS_MS,
  planPartialSweep,
} from "../src/lib/all-conversations-recovery.ts";

const A = "Houston/Maya";
const B = "Houston/Kai";

const row = (id: string, agent_path: string) => ({ id, agent_path });

/**
 * HOU-981, the partial-sweep half. The hosted sweep fans out one read per
 * agent; when one agent's pod is unreachable the others still answer. The
 * result is INCOMPLETE, and treating it as complete is what silently deleted a
 * whole agent's missions from the board (and froze that hole in the cache).
 */
describe("mergePartialSweep", () => {
  it("carries the failed agent's last-known rows forward", () => {
    const previous = [row("a1", A), row("a2", A), row("b1", B)];
    const fresh = [row("b1", B), row("b2", B)];

    const merged = mergePartialSweep(fresh, previous, [A]);

    deepStrictEqual(
      merged.map((r) => r.id),
      ["b1", "b2", "a1", "a2"],
      "fresh rows first, the unreachable agent's cached rows after",
    );
  });

  it("lets the fresh rows win for every agent that ANSWERED", () => {
    // A's read succeeded and returned nothing — that deletion is real and must
    // survive the merge, unlike a failed agent's absence.
    const previous = [row("a1", A), row("b1", B)];

    const merged = mergePartialSweep([row("b1", B)], previous, []);

    deepStrictEqual(
      merged.map((r) => r.id),
      ["b1"],
    );
  });

  it("returns the fresh array untouched when nothing failed", () => {
    const fresh = [row("b1", B)];
    strictEqual(mergePartialSweep(fresh, [row("a1", A)], []), fresh);
  });

  it("returns the fresh array untouched with no previous data", () => {
    const fresh = [row("b1", B)];
    strictEqual(mergePartialSweep(fresh, undefined, [A]), fresh);
    strictEqual(mergePartialSweep(fresh, [], [A]), fresh);
  });

  it("carries nothing when the failed agent had no cached rows", () => {
    const fresh = [row("b1", B)];
    strictEqual(mergePartialSweep(fresh, [row("b0", B)], [A]), fresh);
  });
});

describe("planPartialSweep", () => {
  it("does nothing when the sweep was complete", () => {
    deepStrictEqual(planPartialSweep(0, 0), { toast: false });
    deepStrictEqual(planPartialSweep(0, 2), { toast: false });
  });

  it("surfaces the first incomplete sweep and schedules a re-sweep", () => {
    deepStrictEqual(planPartialSweep(1, 0), {
      toast: true,
      retryInMs: PARTIAL_SWEEP_RETRY_DELAYS_MS[0],
    });
  });

  it("keeps retrying on a widening backoff without re-toasting", () => {
    strictEqual(planPartialSweep(1, 1).toast, false);
    strictEqual(
      planPartialSweep(1, 1).retryInMs,
      PARTIAL_SWEEP_RETRY_DELAYS_MS[1],
    );
    strictEqual(
      planPartialSweep(1, 2).retryInMs,
      PARTIAL_SWEEP_RETRY_DELAYS_MS[2],
    );
  });

  it("gives up past the last delay — a broken agent must not keep the fleet awake", () => {
    const decision = planPartialSweep(1, PARTIAL_SWEEP_RETRY_DELAYS_MS.length);
    strictEqual(decision.retryInMs, undefined);
    strictEqual(decision.toast, false);
  });
});
