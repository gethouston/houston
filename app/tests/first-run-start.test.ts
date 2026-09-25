import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { startFirstRun } from "../src/components/onboarding/first-run-start.ts";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(opts: { isPending: boolean; armFails?: boolean }) {
  const calls: string[] = [];
  startFirstRun({
    isPending: opts.isPending,
    reportStart: () => calls.push("reportStart"),
    markPending: async () => {
      calls.push("markPending");
    },
    arm: async () => {
      calls.push("arm");
      if (opts.armFails) throw new Error("host unreachable");
    },
    onError: (command) => calls.push(`error:${command}`),
  });
  return calls;
}

describe("startFirstRun", () => {
  it("a fresh run reports its start, marks pending and arms", async () => {
    const calls = harness({ isPending: false });
    await flush();
    deepStrictEqual(calls, ["reportStart", "markPending", "arm"]);
  });

  it("a resumed run arms again without a second start", async () => {
    const calls = harness({ isPending: true });
    await flush();
    deepStrictEqual(calls, ["arm"]);
  });

  it("a failed arm is reported, and the next resume retries it", async () => {
    const first = harness({ isPending: false, armFails: true });
    await flush();
    deepStrictEqual(first, [
      "reportStart",
      "markPending",
      "arm",
      "error:first_message_sent_arm",
    ]);
    const resumed = harness({ isPending: true });
    await flush();
    deepStrictEqual(resumed, ["arm"]);
  });
});
