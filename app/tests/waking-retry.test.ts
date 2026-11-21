import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { retryWhileWaking } from "../src/lib/waking-retry.ts";

class Waking extends Error {}

function harness() {
  const slept: number[] = [];
  const retried: number[] = [];
  return {
    slept,
    retried,
    deps: {
      isWaking: (err: unknown) => err instanceof Waking,
      sleep: async (ms: number) => {
        slept.push(ms);
      },
      onRetry: (_err: unknown, delayMs: number) => {
        retried.push(delayMs);
      },
    },
  };
}

describe("retryWhileWaking", () => {
  it("returns the first attempt's value without sleeping", async () => {
    const h = harness();
    const value = await retryWhileWaking(async () => "row-1", [5, 15], h.deps);
    strictEqual(value, "row-1");
    deepStrictEqual(h.slept, []);
  });

  it("walks the ladder while the pod is waking, then lands", async () => {
    const h = harness();
    let calls = 0;
    const value = await retryWhileWaking(
      async () => {
        calls += 1;
        if (calls < 3) throw new Waking("engine unavailable");
        return "row-1";
      },
      [5, 15, 30],
      h.deps,
    );
    strictEqual(value, "row-1");
    strictEqual(calls, 3);
    deepStrictEqual(h.slept, [5, 15]);
    deepStrictEqual(h.retried, [5, 15]);
  });

  it("surfaces the last waking refusal once the ladder is spent", async () => {
    const h = harness();
    let calls = 0;
    await rejects(
      retryWhileWaking(
        async () => {
          calls += 1;
          throw new Waking(`attempt ${calls}`);
        },
        [5, 15],
        h.deps,
      ),
      (err: unknown) => err instanceof Waking && err.message === "attempt 3",
    );
    deepStrictEqual(h.slept, [5, 15]);
  });

  it("never retries a refusal that is not a wake", async () => {
    const h = harness();
    let calls = 0;
    await rejects(
      retryWhileWaking(
        async () => {
          calls += 1;
          throw new Error("agent not found");
        },
        [5, 15],
        h.deps,
      ),
      /agent not found/,
    );
    strictEqual(calls, 1);
    deepStrictEqual(h.slept, []);
  });

  it("stops the ladder the moment a retry fails for another reason", async () => {
    const h = harness();
    let calls = 0;
    await rejects(
      retryWhileWaking(
        async () => {
          calls += 1;
          if (calls === 1) throw new Waking("engine unavailable");
          throw new Error("store unavailable");
        },
        [5, 15, 30],
        h.deps,
      ),
      /store unavailable/,
    );
    strictEqual(calls, 2);
    deepStrictEqual(h.slept, [5]);
  });

  it("with no ladder is a single attempt", async () => {
    const h = harness();
    await rejects(
      retryWhileWaking(
        async () => {
          throw new Waking("engine unavailable");
        },
        [],
        h.deps,
      ),
      Waking,
    );
    deepStrictEqual(h.slept, []);
  });
});
