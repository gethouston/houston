import { rejects, strictEqual } from "node:assert";
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
