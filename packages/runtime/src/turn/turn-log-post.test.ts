import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { liveDeadline } from "./turn-log-post";

let clock = 0;
const now = () => clock;
const run = (ms: number) => {
  clock += ms;
  vi.advanceTimersByTime(ms);
};
const stall = (ms: number) => {
  clock += ms;
};

beforeEach(() => {
  clock = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("a deadline expires on a live event loop", () => {
  const deadline = liveDeadline(30, now);
  run(29);
  expect(deadline.signal.aborted).toBe(false);
  run(1);
  expect(deadline.signal.aborted).toBe(true);
  expect((deadline.signal.reason as Error).name).toBe("TimeoutError");
});

test("a stall past the deadline buys a fresh window, at most twice", () => {
  const deadline = liveDeadline(30, now);
  stall(250);
  run(30);
  expect(deadline.signal.aborted).toBe(false);
  stall(250);
  run(30);
  expect(deadline.signal.aborted).toBe(false);
  stall(250);
  run(30);
  expect(deadline.signal.aborted).toBe(true);
});

test("a fresh window still expires on a live event loop", () => {
  const deadline = liveDeadline(30, now);
  stall(250);
  run(30);
  run(29);
  expect(deadline.signal.aborted).toBe(false);
  run(1);
  expect(deadline.signal.aborted).toBe(true);
});

test("a cleared deadline never aborts", () => {
  const deadline = liveDeadline(30, now);
  deadline.clear();
  run(1_000);
  expect(deadline.signal.aborted).toBe(false);
});
