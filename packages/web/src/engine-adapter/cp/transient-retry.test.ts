import { describe, expect, test, vi } from "vitest";
import { transientRetryFetch } from "./transient-retry";

/**
 * The transport rides out a rolling deploy or a waking pod — EXCEPT where the
 * caller runs a better-informed ladder of its own. Two ladders on one read
 * multiply into a minute of spinner (the assistant rail row, PRODUCT re-review
 * #13), so the exclusion is pinned here rather than trusted to a comment.
 */

const waking = () =>
  new Response(JSON.stringify({ error: "engine unavailable" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });

describe("transientRetryFetch", () => {
  test("retries a waking read on the reason's schedule", async () => {
    vi.useFakeTimers();
    try {
      const inner = vi.fn(async () => waking());
      const promise = transientRetryFetch(inner)("http://gw/v1/agents");
      await vi.runAllTimersAsync();
      expect((await promise).status).toBe(503);
      expect(inner.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("asks ONCE for a read whose caller owns the retries", async () => {
    const inner = vi.fn(async () => waking());
    const res = await transientRetryFetch(inner)("http://gw/v1/assistant");

    expect(res.status).toBe(503);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("the exclusion is the path, not the string: a query never hides it", async () => {
    const inner = vi.fn(async () => waking());
    await transientRetryFetch(inner)("http://gw/v1/assistant?org=abc");

    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("a write is never blind-retried", async () => {
    const inner = vi.fn(async () => waking());
    await transientRetryFetch(inner)("http://gw/v1/agents", { method: "POST" });

    expect(inner).toHaveBeenCalledTimes(1);
  });
});
