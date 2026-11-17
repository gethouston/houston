import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { anySignal, timeoutSignal } from "./abort-signal";

const nativeTimeout = AbortSignal.timeout;
const nativeAny = AbortSignal.any;

describe("on a webview without AbortSignal.timeout or AbortSignal.any", () => {
  beforeEach(() => {
    Reflect.deleteProperty(AbortSignal, "timeout");
    Reflect.deleteProperty(AbortSignal, "any");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    AbortSignal.timeout = nativeTimeout;
    AbortSignal.any = nativeAny;
  });

  test("timeoutSignal aborts with a TimeoutError once the time is up", () => {
    const signal = timeoutSignal(1_000);
    vi.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
    expect((signal.reason as Error).name).toBe("TimeoutError");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("anySignal aborts with the reason of the first input that aborts", () => {
    const a = new AbortController();
    const b = new AbortController();
    const signal = anySignal([a.signal, b.signal]);
    expect(signal.aborted).toBe(false);
    b.abort("second");
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("second");
    a.abort("first");
    expect(signal.reason).toBe("second");
  });

  test("anySignal is already aborted when an input already is", () => {
    const done = new AbortController();
    done.abort("gone");
    const signal = anySignal([new AbortController().signal, done.signal]);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("gone");
  });

  test("anySignal leaves no listener behind on any input after it aborts", () => {
    const a = new AbortController();
    const b = new AbortController();
    const removeA = vi.spyOn(a.signal, "removeEventListener");
    const removeB = vi.spyOn(b.signal, "removeEventListener");
    const addA = vi.spyOn(a.signal, "addEventListener");
    anySignal([a.signal, b.signal]);
    a.abort();
    const listener = addA.mock.calls[0]?.[1];
    expect(removeA).toHaveBeenCalledWith("abort", listener);
    expect(removeB).toHaveBeenCalledWith("abort", listener);
  });

  test("anySignal composed with timeoutSignal times out and stops on caller abort", () => {
    const caller = new AbortController();
    const timed = anySignal([caller.signal, timeoutSignal(500)]);
    vi.advanceTimersByTime(500);
    expect((timed.reason as Error).name).toBe("TimeoutError");

    const other = new AbortController();
    const cancelled = anySignal([other.signal, timeoutSignal(500)]);
    other.abort("stop");
    expect(cancelled.reason).toBe("stop");
  });
});

test("the native APIs are used when the webview has them", () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const any = vi.spyOn(AbortSignal, "any");
  const caller = new AbortController();
  anySignal([caller.signal, timeoutSignal(1_000)]);
  expect(timeout).toHaveBeenCalledWith(1_000);
  expect(any).toHaveBeenCalledTimes(1);
  caller.abort();
  timeout.mockRestore();
  any.mockRestore();
});
