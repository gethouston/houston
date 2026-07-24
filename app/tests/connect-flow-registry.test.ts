import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  beginFlow,
  cancelFlow,
  createRegistry,
  endFlow,
  flowPromise,
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

describe("connect-flow registry — only a user Cancel stops a flow", () => {
  it("exposes no bulk cancel: leaving a surface must not kill live polls", () => {
    // The registry is ONE app-wide map now (`stores/connect-flow.ts`), shared by
    // every surface. A "cancel everything on unmount" helper would mean walking
    // from the Integrations tab to chat silently killed the OAuth the user is
    // still finishing in their browser, so no such helper exists, and no hook
    // may reintroduce one.
    const registry = readFileSync(
      new URL(
        "../src/components/integrations/connect-flow-registry.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const hook = readFileSync(
      new URL(
        "../src/components/integrations/use-connect-flow.ts",
        import.meta.url,
      ),
      "utf8",
    );
    strictEqual(registry.includes("cancelAllFlows"), false);
    strictEqual(hook.includes("cancelAllFlows"), false);
    // ...and the hook keeps no unmount teardown of its own.
    strictEqual(hook.includes("useEffect"), false);
  });

  it("a live flow survives until its own cancel", () => {
    const reg = createRegistry();
    const a = beginFlow(reg, "gmail", countingWaker());
    const b = beginFlow(reg, "slack", countingWaker());
    if (!a || !b) throw new Error("entries expected");
    cancelFlow(reg, "gmail");
    strictEqual(a.cancelled, true);
    strictEqual(b.cancelled, false);
    strictEqual(reg.has("slack"), true);
  });
});

describe("connect-flow registry — cross-surface single flight", () => {
  it("a second caller for the same slug JOINS the running flow's promise", async () => {
    const reg = createRegistry();
    const entry = beginFlow(reg, "gmail", countingWaker());
    if (!entry) throw new Error("entry expected");
    const run = Promise.resolve("active" as const);
    entry.promise = run;

    // The chat card asking for gmail while the Integrations tab is mid-OAuth
    // must observe THAT flow's outcome, not start a rival hand-off.
    strictEqual(flowPromise(reg, "gmail"), run);
    strictEqual(await flowPromise(reg, "gmail"), "active");
    strictEqual(beginFlow(reg, "gmail", countingWaker()), null);
  });

  it("a slug with no live flow has no promise to join", () => {
    const reg = createRegistry();
    strictEqual(flowPromise(reg, "slack"), null);
    const entry = beginFlow(reg, "slack", countingWaker());
    if (!entry) throw new Error("entry expected");
    // Freshly claimed, before its run is attached.
    strictEqual(flowPromise(reg, "slack"), null);
    endFlow(reg, "slack");
    strictEqual(flowPromise(reg, "slack"), null);
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
