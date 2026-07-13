import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isTransientPushError,
  PUSH_RETRY_DELAYS_MS,
} from "../src/lib/claude-push-retry.ts";

describe("claude credential push retry policy", () => {
  it("retries engine/gateway 5xx (waking pod, setup pod re-provisioning)", () => {
    strictEqual(isTransientPushError({ status: 503 }), true);
    strictEqual(isTransientPushError({ status: 500 }), true);
  });

  it("does not retry 4xx (malformed envelope, refused push)", () => {
    strictEqual(isTransientPushError({ status: 400 }), false);
    strictEqual(isTransientPushError({ status: 403 }), false);
  });

  it("retries plain network drops (no status)", () => {
    strictEqual(isTransientPushError(new TypeError("Failed to fetch")), true);
    strictEqual(isTransientPushError(new Error("boom")), false);
  });

  it("bounds the wait: a few short backoffs, never minutes", () => {
    const total = PUSH_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
    strictEqual(total <= 30_000, true);
  });
});
