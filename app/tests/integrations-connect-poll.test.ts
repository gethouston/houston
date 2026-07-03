import { rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { pollConnectionUntilActive } from "../src/components/tabs/integrations-tab-model.ts";

/** A `sleep` that resolves instantly so the loop runs without real timers. */
const noSleep = () => Promise.resolve();

const conn = (
  status: IntegrationConnection["status"],
): IntegrationConnection => ({
  toolkit: "gmail",
  connectionId: "ca_1",
  status,
});

describe("pollConnectionUntilActive", () => {
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

  it("returns 'error' (NOT silent) when the provider reports a failed connection", async () => {
    const outcome = await pollConnectionUntilActive({
      poll: () => Promise.resolve(conn("error")),
      sleep: noSleep,
      isCancelled: () => false,
      maxAttempts: 10,
    });
    // The caller surfaces this as a toast; the loop must report it, not swallow.
    strictEqual(outcome, "error");
  });

  it("returns 'timeout' (NOT silent) when the budget is spent while still pending", async () => {
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

  it("stops immediately with 'cancelled' when the user leaves before polling", async () => {
    let calls = 0;
    const outcome = await pollConnectionUntilActive({
      poll: () => {
        calls++;
        return Promise.resolve(conn("pending"));
      },
      sleep: noSleep,
      isCancelled: () => true,
      maxAttempts: 10,
    });
    strictEqual(outcome, "cancelled");
    strictEqual(calls, 0);
  });

  it("returns 'cancelled' when the user leaves mid-flow (after the sleep)", async () => {
    let polls = 0;
    let cancelled = false;
    const outcome = await pollConnectionUntilActive({
      poll: () => {
        polls++;
        return Promise.resolve(conn("pending"));
      },
      // Flip cancellation during the inter-attempt wait of the 2nd iteration.
      sleep: () => {
        if (polls >= 1) cancelled = true;
        return Promise.resolve();
      },
      isCancelled: () => cancelled,
      maxAttempts: 10,
    });
    strictEqual(outcome, "cancelled");
    strictEqual(polls, 1);
  });

  it("propagates a poll rejection so the caller's catch surfaces it", async () => {
    // A network failure inside the connection poll is surfaced by `call()` and
    // re-thrown. The loop must let it propagate so the click handler's catch
    // absorbs it (no unhandled rejection, failure already toasted).
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
