import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { startIdleWatchdog } from "./idle-watchdog";

const IDLE = 45_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

function watch() {
  let stalls = 0;
  const dog = startIdleWatchdog({
    idleTimeoutMs: IDLE,
    now: Date.now,
    onStall: () => stalls++,
  });
  return { dog, stalls: () => stalls };
}

function sleepThenWake(ms: number) {
  vi.setSystemTime(Date.now() + ms);
  vi.advanceTimersByTime(5_000);
}

test("a connection silent for the idle timeout while the page runs stalls", () => {
  const { dog, stalls } = watch();
  vi.advanceTimersByTime(IDLE);
  expect(stalls()).toBe(0);
  vi.advanceTimersByTime(5_000);
  expect(stalls()).toBe(1);
  dog.stop();
});

test("bytes keep a connection alive", () => {
  const { dog, stalls } = watch();
  for (let i = 0; i < 20; i++) {
    vi.advanceTimersByTime(15_000);
    dog.touch();
  }
  expect(stalls()).toBe(0);
  dog.stop();
});

test("a page woken once a minute never stalls its stream", () => {
  const { dog, stalls } = watch();
  for (let i = 0; i < 10; i++) {
    sleepThenWake(60_000);
    dog.touch();
  }
  expect(stalls()).toBe(0);
  dog.stop();
});

test("a socket that died while the page slept is caught one timeout after it wakes", () => {
  const { dog, stalls } = watch();
  sleepThenWake(10 * 60_000);
  expect(stalls()).toBe(0);
  vi.advanceTimersByTime(IDLE);
  expect(stalls()).toBe(0);
  vi.advanceTimersByTime(5_000);
  expect(stalls()).toBe(1);
  dog.stop();
});

test("silentMs is wall-clock time since the last bytes", () => {
  const { dog } = watch();
  vi.advanceTimersByTime(7_000);
  dog.touch();
  sleepThenWake(30_000);
  expect(dog.silentMs()).toBe(35_000);
  dog.stop();
});

test("stop ends the sweep", () => {
  const { dog, stalls } = watch();
  dog.stop();
  vi.advanceTimersByTime(10 * IDLE);
  expect(stalls()).toBe(0);
});
