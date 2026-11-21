import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { createStallWatchdog, isAbortEcho } from "./stall-watchdog";

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
  expect(stalls).toBe(0);
  vi.advanceTimersByTime(1);
  expect(stalls).toBe(1);
  vi.advanceTimersByTime(10_000);
  expect(stalls).toBe(1);
});

test("every event resets the clock, so a steadily streaming turn never trips", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(900);
    wd.onEvent(textEvent);
  }
  expect(stalls).toBe(0);
  vi.advanceTimersByTime(1000);
  expect(stalls).toBe(1);
});

test("a tool in flight suspends the watchdog; it re-arms only once the tool ends", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  wd.onEvent(toolStart("bash"));
  vi.advanceTimersByTime(60_000);
  expect(stalls).toBe(0);
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
  vi.advanceTimersByTime(5000);
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

test("touch resets the clock without a wire event — a tool call's streamed input keeps the turn alive", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  for (let i = 0; i < 5; i++) {
    vi.advanceTimersByTime(900);
    wd.touch();
  }
  expect(stalls).toBe(0);
  vi.advanceTimersByTime(1000);
  expect(stalls).toBe(1);
});

test("touch never re-arms the clock while a tool is running", () => {
  vi.useFakeTimers();
  let stalls = 0;
  const wd = createStallWatchdog({ timeoutMs: 1000, onStall: () => stalls++ });

  wd.arm();
  wd.onEvent(toolStart("bash"));
  wd.touch();
  vi.advanceTimersByTime(60_000);
  expect(stalls).toBe(0);
  wd.onEvent(toolEnd("bash"));
  vi.advanceTimersByTime(1000);
  expect(stalls).toBe(1);
});

test("isAbortEcho matches only pi's echo of an abort, never a real provider failure", () => {
  expect(
    isAbortEcho({
      kind: "unknown",
      provider: "azure-openai-responses",
      raw_excerpt: "This operation was aborted",
    }),
  ).toBe(true);
  expect(
    isAbortEcho({
      kind: "unknown",
      provider: "azure-openai-responses",
      raw_excerpt: "The server had an error processing your request.",
    }),
  ).toBe(false);
  expect(
    isAbortEcho({
      kind: "provider_internal",
      provider: "azure-openai-responses",
      http_status: null,
      message: "This operation was aborted",
    }),
  ).toBe(false);
});
