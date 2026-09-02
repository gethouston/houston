import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import type { FlowEntry } from "../src/components/integrations/connect-flow-registry.ts";
import {
  CONNECT_SUCCESS_DWELL_MS,
  type ConnectRunDeps,
  noticeFor,
  runConnectFlow,
} from "../src/components/integrations/connect-flow-run.ts";
import type { PollOutcome } from "../src/components/integrations/model.ts";

const conn = (
  status: IntegrationConnection["status"],
): IntegrationConnection => ({
  toolkit: "slack",
  connectionId: "ca_1",
  status,
});

/** A recorder for everything the runner publishes, in the order it happens, so
 *  a test can assert the PHASE ORDER and not just the end state. */
function harness(
  overrides: Partial<ConnectRunDeps> & {
    statuses?: IntegrationConnection["status"][];
  } = {},
) {
  const events: string[] = [];
  const entry: FlowEntry = {
    waker: { wait: () => Promise.resolve(), wake: () => {} },
    cancelled: false,
    redirectUrl: null,
    promise: null,
  };
  const statuses = overrides.statuses ?? ["active"];
  let poll = 0;
  const deps: ConnectRunDeps = {
    entry,
    mintLink: () => {
      events.push("mint");
      return Promise.resolve({
        redirectUrl: "https://oauth.example/slack",
        connectionId: "ca_1",
      });
    },
    openUrl: () => {
      events.push("open");
      return Promise.resolve(true);
    },
    readConnection: () =>
      Promise.resolve(conn(statuses[Math.min(poll++, statuses.length - 1)])),
    setStep: (toolkit, step) => events.push(`step:${toolkit}=${step}`),
    setNotice: (toolkit, notice) => events.push(`notice:${toolkit}=${notice}`),
    invalidate: () => {
      events.push("invalidate");
      return Promise.resolve();
    },
    focus: () => {
      events.push("focus");
      return Promise.resolve();
    },
    announce: (toolkit, outcome) => events.push(`toast:${toolkit}=${outcome}`),
    release: (toolkit) => events.push(`release:${toolkit}`),
    report: (command) => events.push(`report:${command}`),
    wait: () => Promise.resolve(),
    sleep: (ms) => {
      events.push(`sleep:${ms}`);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { deps, entry, events };
}

describe("runConnectFlow — phase order", () => {
  it("stays on 'starting' until the browser is actually opened", async () => {
    const { deps, events } = harness();
    await runConnectFlow("slack", deps);
    // The gate that matters: `waiting` (whose copy claims the app was opened in
    // the browser) may only be published AFTER openUrl resolves.
    const opening = events.indexOf("step:slack=starting");
    const opened = events.indexOf("open");
    const waiting = events.indexOf("step:slack=waiting");
    strictEqual(opening < opened, true, "starting precedes the browser hop");
    strictEqual(opened < waiting, true, "waiting only after the browser opens");
  });

  it("clears any stale outcome before publishing the new phase", async () => {
    const { deps, events } = harness();
    await runConnectFlow("slack", deps);
    deepStrictEqual(events.slice(0, 2), [
      "notice:slack=null",
      "step:slack=starting",
    ]);
  });
});

describe("runConnectFlow — outcomes", () => {
  it("a landed OAuth confirms on the row, toasts, dwells, THEN refreshes", async () => {
    const { deps, events } = harness();
    strictEqual(await runConnectFlow("slack", deps), "active");
    // The dwell sits between the confirmation and the refresh: without it the
    // app teleports out of Available into Installed in the same frame.
    deepStrictEqual(events, [
      "notice:slack=null",
      "step:slack=starting",
      "mint",
      "open",
      "step:slack=waiting",
      // The notice is published BEFORE the step clears: the store reads a flow
      // that ended carrying no outcome as a cancel and retires its origin.
      "notice:slack=connected",
      "step:slack=null",
      // The snap-back (PRODUCT-1298): the user just finished the OAuth in the
      // browser, so the app surfaces itself the moment the connection lands.
      "focus",
      "toast:slack=active",
      `sleep:${CONNECT_SUCCESS_DWELL_MS}`,
      "invalidate",
      "release:slack",
      "step:slack=null",
    ]);
  });

  it("a provider-side failure leaves a 'failed' notice and toasts it", async () => {
    const { deps, events } = harness({ statuses: ["error"] });
    strictEqual(await runConnectFlow("slack", deps), "error");
    strictEqual(events.includes("notice:slack=failed"), true);
    strictEqual(events.includes("toast:slack=error"), true);
    // No dwell: nothing lands, so nothing needs holding before the refresh.
    strictEqual(
      events.includes(`sleep:${CONNECT_SUCCESS_DWELL_MS}`),
      false,
      "the success dwell is success-only",
    );
  });

  it("an abandoned OAuth is surfaced as 'stopped', never as a failure", async () => {
    // The user walked away: the connection stays pending until the attempt
    // budget runs out. Both waits resolve instantly here, so the real
    // POLL_MAX_ATTEMPTS budget costs nothing to exhaust.
    const { deps, events } = harness({
      readConnection: () => Promise.resolve(conn("pending")),
    });
    strictEqual(await runConnectFlow("slack", deps), "timeout");
    strictEqual(events.includes("notice:slack=stopped"), true);
    strictEqual(events.includes("toast:slack=timeout"), true);
    strictEqual(
      events.includes("notice:slack=failed"),
      false,
      "walking away from an OAuth is normal behavior, not a failure",
    );
  });

  it("the snap-back is success-only: no focus on failure, timeout, or cancel", async () => {
    // A failure leaves the user reading the provider's error page and a
    // timeout means they walked away — pulling the window to the front in
    // either case would be focus-stealing, not a hand-back.
    for (const status of ["error", "pending"] as const) {
      const { deps, events } = harness({ statuses: [status] });
      await runConnectFlow("slack", deps);
      strictEqual(events.includes("focus"), false, `no focus for ${status}`);
    }
    const cancelled = harness({ statuses: ["pending"] });
    cancelled.entry.cancelled = true;
    await runConnectFlow("slack", cancelled.deps);
    strictEqual(cancelled.events.includes("focus"), false);
  });

  it("a rejecting focus is reported, never breaks the settle", async () => {
    const { deps, events } = harness({
      focus: () => Promise.reject(new Error("window is gone")),
    });
    strictEqual(await runConnectFlow("slack", deps), "active");
    strictEqual(events.includes("invalidate"), true, "the refresh still runs");
    strictEqual(events.includes("report:integrations.connectFlow.focus"), true);
  });

  it("maps every settled outcome to the notice its row shows", () => {
    strictEqual(noticeFor("active"), "connected");
    strictEqual(noticeFor("timeout"), "stopped");
    strictEqual(noticeFor("error"), "failed");
  });

  it("a cancel is silent: no notice, no toast, still refreshes and releases", async () => {
    const { deps, entry, events } = harness({ statuses: ["pending"] });
    entry.cancelled = true;
    strictEqual(await runConnectFlow("slack", deps), "cancelled");
    strictEqual(
      events.some((e) => e.startsWith("toast:")),
      false,
      "cancelling is the user's own doing, so nothing is announced",
    );
    strictEqual(
      events.some((e) => e === "notice:slack=connected"),
      false,
    );
    strictEqual(events.includes("invalidate"), true);
    strictEqual(events.includes("release:slack"), true);
  });

  it("a cancel during 'starting' never opens the browser", async () => {
    const { deps, entry, events } = harness();
    const original = deps.mintLink;
    deps.mintLink = async (toolkit) => {
      const link = await original(toolkit);
      // The user hit Cancel while the hosted link was still being minted.
      entry.cancelled = true;
      return link;
    };
    strictEqual(await runConnectFlow("slack", deps), "cancelled");
    strictEqual(events.includes("open"), false, "no OAuth tab was popped");
    strictEqual(events.includes("step:slack=waiting"), false);
  });
});

describe("runConnectFlow — a blocked browser tab", () => {
  it("publishes 'blocked' instead of 'waiting' and still polls to the outcome", async () => {
    // The web build's popup blocker refused the open after the async mint
    // hop (PRODUCT-1625). The row must NOT claim the page is open; the poll
    // still runs, because the user can open the page from the row itself.
    const { deps, events } = harness();
    deps.openUrl = () => {
      events.push("open:refused");
      return Promise.resolve(false);
    };
    strictEqual(await runConnectFlow("slack", deps), "active");
    strictEqual(events.includes("step:slack=blocked"), true);
    strictEqual(events.includes("step:slack=waiting"), false);
    strictEqual(
      events.indexOf("open:refused") < events.indexOf("step:slack=blocked"),
      true,
      "the verdict comes from the open itself",
    );
    strictEqual(events.includes("notice:slack=connected"), true);
  });
});

describe("runConnectFlow — engine failures", () => {
  it("swallows a failed engine call (already toasted by call()) and frees the slug", async () => {
    const { deps, events } = harness({
      mintLink: () => Promise.reject(new Error("boom")),
    });
    strictEqual(await runConnectFlow("slack", deps), null);
    strictEqual(events.includes("release:slack"), true);
    strictEqual(
      events.filter((e) => e === "step:slack=null").length >= 1,
      true,
      "the live phase is always cleared",
    );
  });

  it("leaves a 'failed' notice on the row so the death is explained, not blank", async () => {
    // call() toasts the engine failure, but the row the user pressed must not
    // simply empty out: it says the same thing a provider rejection says.
    const { deps, events } = harness({
      mintLink: () => Promise.reject(new Error("boom")),
    });
    await runConnectFlow("slack", deps);
    strictEqual(events.includes("notice:slack=failed"), true);
  });

  it("a broken refresh is REPORTED, never mistaken for a failed connect", async () => {
    // The OAuth landed. An invalidate() rejection is our bug, not the user's
    // outcome — widening the try over settle() used to swallow "active" into
    // null and tell the user the connect had failed.
    const { deps, events } = harness({
      invalidate: () => Promise.reject(new Error("cache exploded")),
    });
    strictEqual(await runConnectFlow("slack", deps), "active");
    strictEqual(events.includes("notice:slack=connected"), true);
    strictEqual(
      events.includes("report:integrations.connectFlow.settle"),
      true,
      "no silent failures: the broken refresh reaches Sentry",
    );
    strictEqual(events.includes("release:slack"), true);
  });

  it("a throwing toast cannot reject out of the fire-and-forget click handler", async () => {
    const { deps, events } = harness({
      announce: () => {
        throw new Error("toast store is gone");
      },
    });
    strictEqual(await runConnectFlow("slack", deps), "active");
    strictEqual(
      events.includes("report:integrations.connectFlow.settle"),
      true,
    );
  });
});

describe("runConnectFlow — the poll drives the outcome", () => {
  it("keeps polling while the connection is pending, then lands", async () => {
    let polls = 0;
    const { deps } = harness({
      readConnection: () => {
        polls++;
        return Promise.resolve(conn(polls >= 3 ? "active" : "pending"));
      },
    });
    const outcome: PollOutcome | null = await runConnectFlow("slack", deps);
    strictEqual(outcome, "active");
    strictEqual(polls, 3);
  });
});
