import { EngineError } from "@houston/runtime-client";
import { describe, expect, it } from "vitest";
import { retryComputeRefusals } from "./compute-retry";

function instantClock() {
  const pauses: number[] = [];
  return {
    pauses,
    clock: {
      now: () => 0,
      setTimeout: (fn: () => void, ms: number) => {
        pauses.push(ms);
        queueMicrotask(fn);
        return 0;
      },
      clearTimeout: () => {},
    },
  };
}

const busy = (retryAfterMs?: number) =>
  new EngineError(
    503,
    JSON.stringify({
      error: "agent busy; retry in a moment",
      code: "compute_busy",
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    }),
  );

describe("retryComputeRefusals", () => {
  it("re-runs a call the gateway refused as compute_busy until it lands", async () => {
    const { clock, pauses } = instantClock();
    let calls = 0;
    const got = await retryComputeRefusals(clock, async () => {
      if (++calls < 3) throw busy(1_500);
      return "renamed";
    });
    expect(got).toBe("renamed");
    expect(calls).toBe(3);
    expect(pauses).toEqual([1_500, 1_500]);
  });

  it("stops at the budget with the last refusal", async () => {
    const { clock, pauses } = instantClock();
    const err = await retryComputeRefusals(clock, async () => {
      throw busy(9_000);
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect(pauses).toEqual([9_000, 9_000]);
  });

  it("rethrows anything else at once", async () => {
    const { clock, pauses } = instantClock();
    const waking = new EngineError(
      503,
      JSON.stringify({ error: "engine unavailable" }),
    );
    await expect(
      retryComputeRefusals(clock, async () => {
        throw waking;
      }),
    ).rejects.toBe(waking);
    expect(pauses).toEqual([]);
  });
});
