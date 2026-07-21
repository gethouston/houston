import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  beginFlow,
  cancelAllFlows,
  cancelFlow,
  createRegistry,
  endFlow,
  flowRedirectUrl,
  wakeFlow,
} from "../src/components/integrations/connect-flow-registry.ts";
import type { Waker } from "../src/components/integrations/model.ts";

/** A `Waker` that counts wakes and never really sleeps — enough to prove which
 *  flow got woken without any timers. */
function countingWaker(): Waker & { wakes: number } {
  const w = {
    wakes: 0,
    wait: () => Promise.resolve(),
    wake: () => {
      w.wakes++;
    },
  };
  return w;
}

describe("connect-flow registry — per-slug single flight", () => {
  it("beginFlow claims a slug, and a second claim for the SAME slug is refused", () => {
    const reg = createRegistry();
    const first = beginFlow(reg, "gmail", countingWaker());
    strictEqual(first !== null, true);
    // Same slug already in flight → null (the single-flight guard).
    strictEqual(beginFlow(reg, "gmail", countingWaker()), null);
  });

  it("a DIFFERENT slug claims its own entry concurrently", () => {
    const reg = createRegistry();
    strictEqual(beginFlow(reg, "gmail", countingWaker()) !== null, true);
    strictEqual(beginFlow(reg, "slack", countingWaker()) !== null, true);
    strictEqual(reg.size, 2);
  });

  it("endFlow frees only its slug, so it can be reconnected", () => {
    const reg = createRegistry();
    beginFlow(reg, "gmail", countingWaker());
    beginFlow(reg, "slack", countingWaker());
    endFlow(reg, "gmail");
    strictEqual(reg.has("gmail"), false);
    strictEqual(reg.has("slack"), true);
    // Freed slug can start a fresh flow.
    strictEqual(beginFlow(reg, "gmail", countingWaker()) !== null, true);
  });
});

describe("connect-flow registry — cancel isolation", () => {
  it("cancelling slug A flags + wakes A only; B is untouched", () => {
    const reg = createRegistry();
    const a = beginFlow(reg, "gmail", countingWaker());
    const b = beginFlow(reg, "slack", countingWaker());
    if (!a || !b) throw new Error("entries expected");

    cancelFlow(reg, "gmail");

    strictEqual(a.cancelled, true);
    strictEqual((a.waker as ReturnType<typeof countingWaker>).wakes, 1);
    // B must keep running — cancelling one app never stops the other.
    strictEqual(b.cancelled, false);
    strictEqual((b.waker as ReturnType<typeof countingWaker>).wakes, 0);
  });

  it("cancelFlow on an unknown slug is a no-op", () => {
    const reg = createRegistry();
    const b = beginFlow(reg, "slack", countingWaker());
    if (!b) throw new Error("entry expected");
    cancelFlow(reg, "gmail");
    strictEqual(b.cancelled, false);
  });
});

describe("connect-flow registry — unmount cancels ALL", () => {
  it("cancelAllFlows flags and wakes every live flow", () => {
    const reg = createRegistry();
    const a = beginFlow(reg, "gmail", countingWaker());
    const b = beginFlow(reg, "slack", countingWaker());
    const c = beginFlow(reg, "notion", countingWaker());
    if (!a || !b || !c) throw new Error("entries expected");

    cancelAllFlows(reg);

    deepStrictEqual(
      [a.cancelled, b.cancelled, c.cancelled],
      [true, true, true],
    );
    for (const e of [a, b, c]) {
      strictEqual((e.waker as ReturnType<typeof countingWaker>).wakes, 1);
    }
  });
});

describe("connect-flow registry — wake + redirect are per slug", () => {
  it("wakeFlow wakes only the named flow", () => {
    const reg = createRegistry();
    const a = beginFlow(reg, "gmail", countingWaker());
    const b = beginFlow(reg, "slack", countingWaker());
    if (!a || !b) throw new Error("entries expected");
    wakeFlow(reg, "gmail");
    strictEqual((a.waker as ReturnType<typeof countingWaker>).wakes, 1);
    strictEqual((b.waker as ReturnType<typeof countingWaker>).wakes, 0);
  });

  it("flowRedirectUrl reads back the per-flow link, null when absent", () => {
    const reg = createRegistry();
    const a = beginFlow(reg, "gmail", countingWaker());
    if (!a) throw new Error("entry expected");
    strictEqual(flowRedirectUrl(reg, "gmail"), null);
    a.redirectUrl = "https://oauth.example/gmail";
    strictEqual(flowRedirectUrl(reg, "gmail"), "https://oauth.example/gmail");
    // A slug with no live flow reads null (reopen after end is a no-op).
    strictEqual(flowRedirectUrl(reg, "slack"), null);
  });
});
