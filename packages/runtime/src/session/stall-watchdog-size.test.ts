import { afterEach, expect, test, vi } from "vitest";
import { unansweredWindowMs } from "../ai/first-byte";
import { createStallWatchdog, type StallReason } from "./stall-watchdog";

/**
 * The `unanswered` cut waits as long as the hedge does for the request it
 * watches: a large prompt is still being read when a small one's window ends.
 */

afterEach(() => {
  vi.useRealTimers();
});

function watch() {
  const trips: { reason: StallReason; windowMs: number }[] = [];
  const wd = createStallWatchdog({
    timeoutMs: 600_000,
    firstResponseMs: (provider, promptTokens) =>
      unansweredWindowMs(provider, 15_000, promptTokens),
    onStall: (reason, windowMs) => trips.push({ reason, windowMs }),
  });
  wd.arm();
  return { wd, trips };
}

test("an 800k-token request is not cut at the small-prompt window", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  wd.onPhase({
    phase: "requesting",
    provider: "anthropic",
    promptTokens: 800_000,
  });
  vi.advanceTimersByTime(183_332);
  expect(trips).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(trips).toEqual([{ reason: "unanswered", windowMs: 183_333 }]);
});

test("an unsized request keeps the small-prompt window", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  wd.onPhase({ phase: "requesting", provider: "anthropic" });
  vi.advanceTimersByTime(50_000);
  expect(trips).toEqual([{ reason: "unanswered", windowMs: 50_000 }]);
});
