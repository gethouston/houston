import { deepStrictEqual, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  beginFlow,
  endFlow,
} from "../src/components/integrations/connect-flow-registry.ts";
import type { Waker } from "../src/components/integrations/model.ts";
import {
  cancelAllConnectFlows,
  connectFlowRegistry,
  useConnectFlowStore,
} from "../src/stores/connect-flow.ts";

/**
 * The identity guard on the shared connect flow. A poll deliberately outlives
 * the surface that started it — but NOT the identity: after an active-space
 * switch or a sign-out its next tick would carry the new `x-houston-org` and
 * answer for the wrong tenant (a red toast about an app the new space never
 * connected, a success toast across spaces, an invalidation into a cache that
 * was just wiped).
 */

/** A waker that records wakes instead of sleeping. */
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

const store = () => useConnectFlowStore.getState();

afterEach(() => {
  for (const toolkit of [...connectFlowRegistry.keys()]) {
    endFlow(connectFlowRegistry, toolkit);
  }
  cancelAllConnectFlows();
  for (const toolkit of Object.keys(store().states)) {
    store().setStep(toolkit, null);
  }
});

describe("cancelAllConnectFlows", () => {
  it("flags and wakes EVERY live flow, so each loop settles as a cancel", () => {
    const slack = countingWaker();
    const notion = countingWaker();
    const slackEntry = beginFlow(connectFlowRegistry, "slack", slack);
    const notionEntry = beginFlow(connectFlowRegistry, "notion", notion);

    cancelAllConnectFlows();

    strictEqual(slackEntry?.cancelled, true);
    strictEqual(notionEntry?.cancelled, true);
    // Woken, not merely flagged: the loop must observe the flag NOW rather than
    // after the next poll interval under the new identity.
    strictEqual(slack.wakes, 1);
    strictEqual(notion.wakes, 1);
  });

  it("is silent — a cancel publishes no outcome for any slug", () => {
    beginFlow(connectFlowRegistry, "slack", countingWaker());
    store().setStep("slack", "waiting");

    cancelAllConnectFlows();

    deepStrictEqual(store().notices, {});
  });

  it("drops the settled residue of the identity that is leaving", () => {
    store().setOrigin("slack", "integrations:communication:slack");
    store().setNotice("slack", "connected");
    strictEqual(store().notices.slack, "connected");

    cancelAllConnectFlows();

    deepStrictEqual(store().notices, {});
    deepStrictEqual(store().origins, {});
  });

  it("is a no-op with nothing in flight (every switch on a personal host)", () => {
    const before = store().notices;

    cancelAllConnectFlows();

    strictEqual(store().notices, before, "no pointless re-render");
  });
});

describe("connect-flow origins", () => {
  it("a settled flow keeps its origin, so the row that started it confirms", () => {
    store().setOrigin("slack", "integrations:communication:slack");
    store().setStep("slack", "waiting");
    // The runner's settle order: publish the outcome, THEN clear the phase.
    store().setNotice("slack", "connected");
    store().setStep("slack", null);

    strictEqual(store().origins.slack, "integrations:communication:slack");
  });

  it("a cancelled flow takes its origin with it (no outcome to place)", () => {
    store().setOrigin("slack", "integrations:communication:slack");
    store().setStep("slack", "waiting");
    store().setStep("slack", null);

    strictEqual("slack" in store().origins, false);
  });
});
