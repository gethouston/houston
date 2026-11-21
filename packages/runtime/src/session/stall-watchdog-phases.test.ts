import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { LOOP_WINDOW_CHARS } from "./runaway-output";
import { stallFailure } from "./stall-failure";
import { createStallWatchdog, type StallReason } from "./stall-watchdog";

afterEach(() => {
  vi.useRealTimers();
});

function watch(firstResponseMs = 300) {
  const trips: { reason: StallReason; windowMs: number }[] = [];
  const wd = createStallWatchdog({
    timeoutMs: 1000,
    firstResponseMs: (provider) =>
      provider === "openai-compatible" ? 0 : firstResponseMs,
    onStall: (reason, windowMs) => trips.push({ reason, windowMs }),
  });
  return { wd, trips };
}

const requesting = (provider = "opencode", afterMs?: number) =>
  ({ phase: "requesting", provider, afterMs }) as const;
const text = (data: string): WireEvent => ({ type: "text", data });

test("a request whose response never opens trips at the first-response window", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  wd.arm();
  wd.onPhase(requesting());
  vi.advanceTimersByTime(299);
  expect(trips).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(trips).toEqual([{ reason: "unanswered", windowMs: 300 }]);
});

test("once the response opens, only the quiet-stream window applies", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  wd.arm();
  wd.onPhase(requesting());
  vi.advanceTimersByTime(200);
  wd.onPhase({ phase: "responding" });
  vi.advanceTimersByTime(999);
  expect(trips).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(trips).toEqual([{ reason: "silent", windowMs: 1000 }]);
});

test("a retry's backoff extends the window of the request it delays", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  wd.arm();
  wd.onPhase(requesting("opencode", 500));
  vi.advanceTimersByTime(799);
  expect(trips).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(trips).toEqual([{ reason: "unanswered", windowMs: 800 }]);
});

test("a custom endpoint keeps only the quiet-stream window", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  wd.arm();
  wd.onPhase(requesting("openai-compatible"));
  vi.advanceTimersByTime(999);
  expect(trips).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(trips).toEqual([{ reason: "silent", windowMs: 1000 }]);
});

test("a quiet-stream window shorter than the first-response one wins", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch(5000);
  wd.arm();
  wd.onPhase(requesting());
  vi.advanceTimersByTime(1000);
  expect(trips).toEqual([{ reason: "silent", windowMs: 1000 }]);
});

test("a tool run suspends the first-response clock too", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  wd.arm();
  wd.onPhase(requesting());
  wd.onEvent({ type: "tool_start", data: { name: "bash", args: {} } });
  vi.advanceTimersByTime(10_000);
  expect(trips).toEqual([]);
});

test("a looping reply trips at once, and only while armed", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  const loop = "Symbol".repeat(LOOP_WINDOW_CHARS / 4);
  for (let i = 0; i < loop.length; i += 64)
    wd.onEvent(text(loop.slice(i, i + 64)));
  expect(trips).toEqual([]);

  wd.arm();
  wd.onPhase({ phase: "responding" });
  for (let i = 0; i < loop.length && trips.length === 0; i += 64)
    wd.onEvent(text(loop.slice(i, i + 64)));
  expect(trips).toEqual([{ reason: "degenerate", windowMs: 0 }]);
});

test("a new assistant message forgets the last one's text", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  wd.arm();
  for (let i = 0; i < 200; i++) {
    wd.onResponseStart();
    wd.onEvent(text("Processing the next batch of records. "));
  }
  expect(trips).toEqual([]);
  wd.onResponseStart();
  for (let i = 0; i < 200 && trips.length === 0; i++)
    wd.onEvent(text("Processing the next batch of records. "));
  expect(trips).toEqual([{ reason: "degenerate", windowMs: 0 }]);
});

test("the watchdog trips at most once", () => {
  vi.useFakeTimers();
  const { wd, trips } = watch();
  wd.arm();
  wd.onPhase(requesting());
  vi.advanceTimersByTime(300);
  wd.onEvent(text("late"));
  wd.onPhase(requesting());
  vi.advanceTimersByTime(10_000);
  expect(trips).toHaveLength(1);
});

test("each trip settles on its own typed card", () => {
  expect(stallFailure("silent", 600_000, "opencode")).toMatchObject({
    kind: "provider_internal",
    http_status: null,
    message: expect.stringContaining("600s"),
  });
  expect(stallFailure("unanswered", 120_000, "opencode")).toMatchObject({
    kind: "provider_internal",
    message: expect.stringContaining("did not start answering"),
  });
  expect(stallFailure("degenerate", 0, "opencode")).toMatchObject({
    kind: "malformed_response",
    provider: "opencode",
  });
});
