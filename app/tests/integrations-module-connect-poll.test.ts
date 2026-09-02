import { ok, rejects, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import {
  createWaker,
  pollConnectionUntilActive,
} from "../src/components/integrations/model.ts";

const noSleep = () => Promise.resolve();
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const conn = (
  status: IntegrationConnection["status"],
): IntegrationConnection => ({
  toolkit: "gmail",
  connectionId: "ca_1",
  status,
});

/** A timer that never auto-fires: only an explicit `wake()` settles the wait. */
function manualTimer() {
  let scheduled: (() => void) | null = null;
  return {
    timer: {
      set: (fn: () => void) => {
        scheduled = fn;
        return 1;
      },
      clear: () => {
        scheduled = null;
      },
    },
    fire: () => {
      const fn = scheduled;
      scheduled = null;
      fn?.();
    },
    pending: () => scheduled !== null,
  };
}

describe("pollConnectionUntilActive (new module)", () => {
  it("returns 'active' as soon as the OAuth finishes", async () => {
    let calls = 0;
    const outcome = await pollConnectionUntilActive({
      poll: () => {
        calls++;
        return Promise.resolve(conn(calls >= 3 ? "active" : "pending"));
      },
      sleep: noSleep,
      isCancelled: () => false,
      maxAttempts: 10,
    });
    strictEqual(outcome, "active");
    strictEqual(calls, 3);
  });

  it("returns 'error' (NOT silent) on a failed connection", async () => {
    const outcome = await pollConnectionUntilActive({
      poll: () => Promise.resolve(conn("error")),
      sleep: noSleep,
      isCancelled: () => false,
      maxAttempts: 10,
    });
    strictEqual(outcome, "error");
  });

  it("returns 'timeout' (NOT silent) when the budget is spent while pending", async () => {
    let calls = 0;
    const outcome = await pollConnectionUntilActive({
      poll: () => {
        calls++;
        return Promise.resolve(conn("pending"));
      },
      sleep: noSleep,
      isCancelled: () => false,
      maxAttempts: 5,
    });
    strictEqual(outcome, "timeout");
    strictEqual(calls, 5);
  });

  it("propagates a poll rejection so the caller's catch surfaces it", async () => {
    await rejects(
      pollConnectionUntilActive({
        poll: () => Promise.reject(new Error("poll failed")),
        sleep: noSleep,
        isCancelled: () => false,
        maxAttempts: 10,
      }),
      /poll failed/,
    );
  });
});

describe("createWaker", () => {
  it("wake() resolves a pending wait early and clears the timer", async () => {
    const { timer, pending } = manualTimer();
    const waker = createWaker(timer);
    let resolved = false;
    const p = waker.wait(1000).then(() => {
      resolved = true;
    });
    strictEqual(pending(), true);
    waker.wake();
    await p;
    strictEqual(resolved, true);
    strictEqual(pending(), false);
  });

  it("resolves when the timer fires on its own (no wake)", async () => {
    const { timer, fire } = manualTimer();
    const waker = createWaker(timer);
    let resolved = false;
    const p = waker.wait(1000).then(() => {
      resolved = true;
    });
    fire();
    await p;
    strictEqual(resolved, true);
  });
});

describe("poll loop driven by a Waker (checkNow / cancel)", () => {
  it("checkNow wakes the loop to poll immediately without the timer firing", async () => {
    const { timer, pending } = manualTimer();
    const waker = createWaker(timer);
    let polls = 0;
    const p = pollConnectionUntilActive({
      poll: () => {
        polls++;
        return Promise.resolve(conn(polls >= 2 ? "active" : "pending"));
      },
      sleep: (ms) => waker.wait(ms),
      isCancelled: () => false,
      maxAttempts: 10,
    });

    await tick(); // loop reaches the first wait
    strictEqual(pending(), true);
    waker.wake(); // "I have finished" → poll #1 (pending)
    await tick();
    waker.wake(); // second wake → poll #2 (active)
    strictEqual(await p, "active");
    strictEqual(polls, 2);
  });

  it("cancel wakes the loop to observe cancellation with no further poll", async () => {
    const { timer } = manualTimer();
    const waker = createWaker(timer);
    let cancelled = false;
    let polls = 0;
    const p = pollConnectionUntilActive({
      poll: () => {
        polls++;
        return Promise.resolve(conn("pending"));
      },
      sleep: (ms) => waker.wait(ms),
      isCancelled: () => cancelled,
      maxAttempts: 10,
    });

    await tick(); // loop reaches the first wait
    cancelled = true;
    waker.wake(); // cancel() → loop checks isCancelled after the wait
    strictEqual(await p, "cancelled");
    strictEqual(polls, 0);
  });
});

/**
 * The catalog surfaces' connect UX (HOU-847). These read the sources rather
 * than render them, so the rules that make the flow calm cannot silently
 * regress: state belongs to the ROW the user clicked, no surface is disabled
 * because a different app is connecting, and the flow state is app-wide.
 */
describe("connect surfaces", () => {
  const read = (rel: string) =>
    readFileSync(new URL(rel, import.meta.url), "utf8");

  it("the catalog has no page-level waiting panel and no whole-surface lockout", () => {
    const catalog = read(
      "../src/components/integrations-view/category-catalog.tsx",
    );
    ok(
      !catalog.includes("ConnectWaitingPanel"),
      "the banner that shoved the sections down is gone",
    );
    ok(
      !catalog.includes("Object.keys(states).length"),
      "no 'any connect is running' flag disables every other row",
    );
    ok(
      catalog.includes("info.toolkit.slug in connectFlow.states"),
      "the detail modal's CTA is gated on ITS OWN app only",
    );
  });

  it("each row owns its connect state, inline", () => {
    const row = read("../src/components/integrations-view/plane-app-row.tsx");
    ok(row.includes("ConnectFlowInline"), "the row renders the inline state");
    ok(
      row.includes("display.toolkit in connectFlow.states"),
      "the + spins for THIS app only",
    );
    ok(!row.includes("busy={busy}"), "no cross-row disable prop survives");
  });

  it("the inline state gates the 'we opened your browser' copy on the waiting phase", () => {
    const inline = read(
      "../src/components/integrations/connect-flow-inline.tsx",
    );
    ok(
      inline.includes('step === "waiting"'),
      "waiting copy needs the waiting phase",
    );
    ok(inline.includes("waiting.opening"), "starting has its own honest copy");
    ok(
      inline.includes('role="status"'),
      "a polite live region announces phases",
    );
    ok(inline.includes('aria-live="polite"'));
    ok(
      inline.includes('step === "blocked"'),
      "a browser that refused the tab gets its own honest phase",
    );
    const block = read(
      "../src/components/integrations/connect-waiting-block.tsx",
    );
    ok(
      block.includes("AsyncButton") && block.includes("Button"),
      "actions are core primitives, not hand-rolled buttons",
    );
    ok(
      block.includes("waiting.blockedTitle") && block.includes("waiting.open"),
      "the blocked phase names the block and offers the open",
    );
  });

  it("the flow reads ONE app-wide store and never bulk-cancels on unmount", () => {
    const hook = read("../src/components/integrations/use-connect-flow.ts");
    ok(
      hook.includes("useConnectFlowStore"),
      "state comes from the shared store",
    );
    ok(hook.includes("connectFlowRegistry"), "so does the registry");
    ok(!hook.includes("createRegistry("), "no per-consumer registry is minted");
    ok(
      hook.includes("flowPromise(connectFlowRegistry"),
      "a second caller joins the running flow",
    );
  });

  it("outcomes are announced once, from the flow, with the right severity", () => {
    const hook = read("../src/components/integrations/use-connect-flow.ts");
    const voice = read("../src/components/integrations/connect-announce.ts");
    ok(
      hook.includes("useConnectAnnounce"),
      "the flow speaks through ONE voice",
    );
    ok(voice.includes("connectResult.connected"), "success is announced");
    ok(
      voice.includes('variant: "info"'),
      "an abandoned OAuth is neutral, not an error",
    );
    ok(
      !hook.includes("showErrorToast") && !voice.includes("showErrorToast"),
      "no branded crash toast + Sentry report for a user walking away",
    );
    const card = read("../src/components/use-integration-connect.tsx");
    ok(
      !card.includes("verifiedToast"),
      "the chat card no longer double-toasts the shared flow's success",
    );
  });

  it("a broken connection lives on the app's own row, never in a recovery pile", () => {
    const pane = read("../src/components/integrations-view/catalog-pane.tsx");
    ok(
      !pane.includes("RecoveryRow"),
      "no recovery section at the top of the pane",
    );
    const row = read("../src/components/integrations-view/plane-app-row.tsx");
    ok(
      row.includes("ConnectionStatusBadge"),
      "the row itself reports the connection that needs finishing",
    );
    ok(
      row.includes("status && !live"),
      "a live flow outranks the at-rest status line",
    );
    const dialog = read(
      "../src/components/integrations-view/app-info-dialog.tsx",
    );
    ok(
      dialog.includes("onRemove(toolkit.slug)"),
      "Remove lives in the app's own dialog",
    );
  });
});
