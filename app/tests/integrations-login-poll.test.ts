import { rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationLoginResult } from "@houston-ai/engine-client";
import { pollLoginUntilLinked } from "../src/components/tabs/integrations-tab-model.ts";

/** A `sleep` that resolves instantly so the loop runs without real timers. */
const noSleep = () => Promise.resolve();

describe("pollLoginUntilLinked", () => {
  it("returns 'linked' as soon as the poll reports linked", async () => {
    let calls = 0;
    const outcome = await pollLoginUntilLinked({
      poll: () => {
        calls++;
        return Promise.resolve(
          (calls >= 3
            ? { status: "linked" }
            : { status: "pending" }) as IntegrationLoginResult,
        );
      },
      sleep: noSleep,
      isCancelled: () => false,
      maxAttempts: 10,
    });
    strictEqual(outcome, "linked");
    strictEqual(calls, 3);
  });

  it("returns 'timeout' (NOT silent) when the budget is spent without linking", async () => {
    let calls = 0;
    const outcome = await pollLoginUntilLinked({
      poll: () => {
        calls++;
        return Promise.resolve({ status: "pending" } as IntegrationLoginResult);
      },
      sleep: noSleep,
      isCancelled: () => false,
      maxAttempts: 5,
    });
    // The caller surfaces this as a toast; the loop must report it, not swallow.
    strictEqual(outcome, "timeout");
    strictEqual(calls, 5);
  });

  it("stops immediately with 'cancelled' when the user leaves before polling", async () => {
    let calls = 0;
    const outcome = await pollLoginUntilLinked({
      poll: () => {
        calls++;
        return Promise.resolve({ status: "pending" } as IntegrationLoginResult);
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
    const outcome = await pollLoginUntilLinked({
      poll: () => {
        polls++;
        return Promise.resolve({ status: "pending" } as IntegrationLoginResult);
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
    // A network failure inside `pollLogin` is surfaced by `call()` and re-thrown.
    // The loop must let it propagate so the click handler's catch absorbs it
    // (no unhandled rejection, failure already toasted).
    await rejects(
      pollLoginUntilLinked({
        poll: () => Promise.reject(new Error("poll failed")),
        sleep: noSleep,
        isCancelled: () => false,
        maxAttempts: 10,
      }),
      /poll failed/,
    );
  });
});
