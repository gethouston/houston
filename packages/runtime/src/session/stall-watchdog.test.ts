import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { createStallWatchdog } from "./stall-watchdog";

/**
 * The stall watchdog is the stalled-provider backstop: it fires `onStall` when a turn's
 * model round-trip goes silent for `timeoutMs` while no tool is running, so a
 * dead SSE read can't hold the workdir lock forever. These drive it with fake
 * timers — no live session — to pin the exact timing contract.
 */

const textEvent: WireEvent = { type: "text", data: "x" };
const toolStart = (name: string): WireEvent => ({
  type: "tool_start",
  data: { name, args: {} },
});
const toolEnd = (name: string): WireEvent => ({
  type: "tool_end",
  data: { name, isError: false },
});

afterEach(() => {
  vi.useRealTimers();
});

test("fires once after the idle window when armed and silent", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  vi.advanceTimersByTime(999);
  expect(stalls).toBe(0); // not yet
  vi.advanceTimersByTime(1);
  expect(stalls).toBe(1); // tripped at the threshold
  vi.advanceTimersByTime(10_000);
  expect(stalls).toBe(1); // and only once
});

test("every event resets the clock, so a steadily streaming turn never trips", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  // A token just under the threshold, five times over: 4.5s elapsed, never idle
  // for a full second.
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(900);
    wd.onEvent(textEvent);
  }
  expect(stalls).toBe(0);
  // Then it goes quiet — now it trips.
  vi.advanceTimersByTime(1000);
  expect(stalls).toBe(1);
});

test("a tool in flight suspends the watchdog; it re-arms only once the tool ends", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  wd.onEvent(toolStart("bash"));
  // A long, legitimately silent build must NOT be aborted.
  vi.advanceTimersByTime(60_000);
  expect(stalls).toBe(0);
  // Tool ends; the provider then stays silent → back to watching → trips.
  wd.onEvent(toolEnd("bash"));
  vi.advanceTimersByTime(1000);
  expect(stalls).toBe(1);
});

test("parallel tools: re-arms only after the LAST tool ends", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  wd.onEvent(toolStart("a"));
  wd.onEvent(toolStart("b"));
  wd.onEvent(toolEnd("b"));
  vi.advanceTimersByTime(5000); // tool "a" still running → no trip
  expect(stalls).toBe(0);
  wd.onEvent(toolEnd("a"));
  vi.advanceTimersByTime(1000);
  expect(stalls).toBe(1);
});

test("unbalanced tool_end never drives depth negative or disables the watchdog", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  // A stray tool_end (no matching start) must not push depth below zero, which
  // would leave a later real tool_start unable to suspend the clock.
  wd.onEvent(toolEnd("ghost"));
  vi.advanceTimersByTime(1000);
  expect(stalls).toBe(1);
});

test("disarm cancels a pending stall", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  vi.advanceTimersByTime(500);
  wd.disarm();
  vi.advanceTimersByTime(10_000);
  expect(stalls).toBe(0);
});

test("a non-positive or non-finite timeout disables the watchdog entirely", () => {
  vi.useFakeTimers();
  let stalls = 0;
  for (const timeoutMs of [0, -1, Number.NaN]) {
    const wd = createStallWatchdog({ timeoutMs, onStall: () => stalls++ });
    wd.arm();
    wd.onEvent(textEvent);
    vi.advanceTimersByTime(10_000);
  }
  expect(stalls).toBe(0);
});
