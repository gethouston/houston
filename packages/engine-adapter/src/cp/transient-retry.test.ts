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

  // The SDK rides this transport for EVERY call, the reactivity stream
  // included: a long-lived GET whose owner reconnects on its own would get a
  // second dialer underneath it.
  test("the reactivity stream owns its own reconnects", async () => {
    const inner = vi.fn(async () => waking());
    const res = await transientRetryFetch(inner)("http://gw/v1/events");

    expect(res.status).toBe(503);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  // A caller that aborted is gone: re-sending its read wastes round trips and
  // buries the AbortError behind the rest of the ladder's backoff.
  test("an aborted read is asked exactly once, and its abort surfaces", async () => {
    const controller = new AbortController();
    controller.abort();
    const inner = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted)
        throw new DOMException("The operation was aborted.", "AbortError");
      return waking();
    }) as unknown as typeof fetch;

    await expect(
      transientRetryFetch(inner)("http://gw/v1/agents", {
        signal: controller.signal,
      }),
    ).rejects.toThrow("The operation was aborted.");
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("an abort mid-backoff ends the ladder instead of waiting it out", async () => {
    const controller = new AbortController();
    const inner = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted)
        throw new DOMException("The operation was aborted.", "AbortError");
      // Inside the first handoff delay (500ms), so the wait itself is what the
      // abort has to cut short.
      setTimeout(() => controller.abort(), 50);
      return waking();
    }) as unknown as typeof fetch;

    const res = await transientRetryFetch(inner)("http://gw/v1/agents", {
      signal: controller.signal,
    });

    expect(res.status).toBe(503);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  test("a write is never blind-retried", async () => {
    const inner = vi.fn(async () => waking());
    await transientRetryFetch(inner)("http://gw/v1/agents", { method: "POST" });

    expect(inner).toHaveBeenCalledTimes(1);
  });
});
