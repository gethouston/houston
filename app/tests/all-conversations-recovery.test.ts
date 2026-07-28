import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  mergePartialSweep,
  NO_SWEEP_RECOVERY,
  PARTIAL_SWEEP_RETRY_DELAYS_MS,
  planPartialSweep,
  planSweepAttempt,
  SWEEP_ATTEMPT_DELAYS_MS,
  stepSweepRecovery,
  sweepIsAuthoritative,
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

/**
 * The run counter is only meaningful for the roster it was counted on. It used
 * to be a bare module counter: it never reset on a space switch, so three
 * partial sweeps in the old space left the NEW space permanently past its
 * retries (no toast, no re-sweep, ever) — and the old space's pending re-sweep
 * still fired, invalidating the `all-conversations` prefix for a roster that
 * was gone.
 */
describe("stepSweepRecovery", () => {
  const R1 = "a|b";
  const R2 = "c|d";

  it("counts consecutive partial sweeps for one roster", () => {
    const first = stepSweepRecovery(NO_SWEEP_RECOVERY, R1, 1);
    strictEqual(first.decision.toast, true);
    strictEqual(first.state.run, 1);

    const second = stepSweepRecovery(first.state, R1, 1);
    strictEqual(second.decision.toast, false);
    strictEqual(second.decision.retryInMs, PARTIAL_SWEEP_RETRY_DELAYS_MS[1]);
    strictEqual(second.state.run, 2);
  });

  it("clears the run when a sweep finally comes back complete", () => {
    const partial = stepSweepRecovery(NO_SWEEP_RECOVERY, R1, 2);
    const clean = stepSweepRecovery(partial.state, R1, 0);

    deepStrictEqual(clean.decision, { toast: false });
    strictEqual(clean.state.run, 0);
  });

  it("starts the new roster from scratch — a space switch is not a retry", () => {
    // Saturate R1: past the last delay it neither toasts nor re-sweeps.
    let state = NO_SWEEP_RECOVERY;
    for (let i = 0; i <= PARTIAL_SWEEP_RETRY_DELAYS_MS.length; i += 1) {
      state = stepSweepRecovery(state, R1, 1).state;
    }
    strictEqual(stepSweepRecovery(state, R1, 1).decision.retryInMs, undefined);

    const switched = stepSweepRecovery(state, R2, 1);

    strictEqual(switched.state.roster, R2);
    deepStrictEqual(switched.decision, {
      toast: true,
      retryInMs: PARTIAL_SWEEP_RETRY_DELAYS_MS[0],
    });
  });

  it("re-keys to the roster even when the sweep was complete", () => {
    const state = stepSweepRecovery(NO_SWEEP_RECOVERY, R1, 1).state;
    strictEqual(stepSweepRecovery(state, R2, 0).state.roster, R2);
  });
});

/**
 * The bounded transient retry lives inside the queryFn, not at the useQuery
 * layer, because `call()` in lib/tauri.ts toasts AND Sentry-captures on every
 * rejection: a retrying query multiplied one dead fleet into ~4 captures and
 * ~2 visible toasts. Exactly one attempt of a run may surface.
 */
describe("planSweepAttempt", () => {
  it("retries a transient failure on a widening backoff, silently", () => {
    for (const [attempt, delay] of SWEEP_ATTEMPT_DELAYS_MS.entries()) {
      deepStrictEqual(planSweepAttempt(attempt, true), {
        retryInMs: delay,
        surface: false,
      });
    }
  });

  it("surfaces a terminal failure immediately — a 4xx never heals", () => {
    deepStrictEqual(planSweepAttempt(0, false), { surface: true });
  });

  it("surfaces the last attempt of an all-transient run", () => {
    deepStrictEqual(planSweepAttempt(SWEEP_ATTEMPT_DELAYS_MS.length, true), {
      surface: true,
    });
  });

  it("surfaces EXACTLY once across a whole run", () => {
    const surfaced = Array.from(
      { length: SWEEP_ATTEMPT_DELAYS_MS.length + 1 },
      (_, attempt) => planSweepAttempt(attempt, true),
    ).filter((d) => d.surface);

    strictEqual(surfaced.length, 1);
  });
});

/**
 * A TanStack query reports `status: "success"` the moment placeholder data is
 * handed out — before any fetch settles. The board's `isLoaded` is what gates
 * the empty-board verdict (auto-opening the composer), so a user whose
 * disk-restored roster variant was `[]` got the composer thrown over an empty
 * board while the real sweep was still in flight underneath.
 */
describe("sweepIsAuthoritative", () => {
  it("rejects the placeholder paint — success is not yet an answer", () => {
    strictEqual(
      sweepIsAuthoritative({ isSuccess: true, isPlaceholderData: true }),
      false,
    );
  });

  it("accepts a settled success", () => {
    strictEqual(
      sweepIsAuthoritative({ isSuccess: true, isPlaceholderData: false }),
      true,
    );
  });

  it("rejects pending and failed reads", () => {
    strictEqual(
      sweepIsAuthoritative({ isSuccess: false, isPlaceholderData: false }),
      false,
    );
    strictEqual(
      sweepIsAuthoritative({ isSuccess: false, isPlaceholderData: true }),
      false,
    );
  });
});
