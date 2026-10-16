import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Clock } from "../../ports";
import { LINKEDIN_POST_DEADLINE_MS, withPostDeadline } from "./post-deadline";
import type { LinkedInPostResult } from "./types";

const clock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id) => clearTimeout(id),
};
const POSTED: LinkedInPostResult = {
  kind: "posted",
  postUrn: null,
  postUrl: null,
};

/** A request that settles only when its signal aborts, or never. */
function hung(heedAbort: boolean) {
  const seen: AbortSignal[] = [];
  const post = (signal: AbortSignal) => {
    seen.push(signal);
    return new Promise<LinkedInPostResult>((_, reject) => {
      if (heedAbort)
        signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
    });
  };
  return { post, seen };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a LinkedIn post's deadline", () => {
  it("answers unknown, never refused, when no answer comes in time", async () => {
    const { post, seen } = hung(true);
    const result = withPostDeadline(clock, undefined, post);
    await vi.advanceTimersByTimeAsync(LINKEDIN_POST_DEADLINE_MS - 1);
    expect(seen[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ kind: "unknown" });
    // The abandoned request is aborted on this device.
    expect(seen[0]?.aborted).toBe(true);
  });

  it("settles even over a transport that ignores the abort", async () => {
    const { post } = hung(false);
    const result = withPostDeadline(clock, undefined, post);
    await vi.advanceTimersByTimeAsync(LINKEDIN_POST_DEADLINE_MS);
    await expect(result).resolves.toEqual({ kind: "unknown" });
  });

  it("passes an answer that came in time through and stops the clock", async () => {
    const result = withPostDeadline(clock, undefined, async () => POSTED);
    await expect(result).resolves.toEqual(POSTED);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops at the answer: reading the rest is never unknown", async () => {
    const result = withPostDeadline(clock, undefined, async (_, answered) => {
      await new Promise((r) => setTimeout(r, LINKEDIN_POST_DEADLINE_MS - 1));
      answered();
      // The body takes past the deadline.
      await new Promise((r) => setTimeout(r, 2));
      return POSTED;
    });
    await vi.advanceTimersByTimeAsync(LINKEDIN_POST_DEADLINE_MS + 1);
    await expect(result).resolves.toEqual(POSTED);
  });

  it("still rejects with the caller's abort", async () => {
    const controller = new AbortController();
    const { post } = hung(true);
    const result = withPostDeadline(clock, controller.signal, post);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
