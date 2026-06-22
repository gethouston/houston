import { test, expect } from "bun:test";
import { RunCodeLimiter, RunCodeLimitError } from "./run-code-limiter";

test("concurrency cap: the (N+1)th simultaneous run is rejected, release frees the slot", () => {
  const limiter = new RunCodeLimiter({ maxConcurrent: 2, maxPerMinute: 100 });
  const r1 = limiter.acquire();
  limiter.acquire();
  expect(() => limiter.acquire()).toThrow(RunCodeLimitError);
  r1();
  expect(() => limiter.acquire()).not.toThrow();
});

test("rolling minute cap: refills as old runs age out", () => {
  let t = 1_000_000;
  const limiter = new RunCodeLimiter(
    { maxConcurrent: 100, maxPerMinute: 3 },
    () => t,
  );
  limiter.acquire()();
  limiter.acquire()();
  limiter.acquire()();
  expect(() => limiter.acquire()).toThrow(RunCodeLimitError);
  t += 59_000; // still within the window of the first three
  expect(() => limiter.acquire()).toThrow(RunCodeLimitError);
  t += 2_000; // first three are now older than 60s
  expect(() => limiter.acquire()).not.toThrow();
});

test("double release is a no-op, not a budget leak", () => {
  const limiter = new RunCodeLimiter({ maxConcurrent: 1, maxPerMinute: 100 });
  const release = limiter.acquire();
  release();
  release(); // must not decrement below zero...
  const r2 = limiter.acquire(); // ...which this acquire would mask
  expect(() => limiter.acquire()).toThrow(RunCodeLimitError);
  r2();
});

test("the error tells the model the actual budget", () => {
  const limiter = new RunCodeLimiter({ maxConcurrent: 1, maxPerMinute: 9 });
  limiter.acquire();
  expect(() => limiter.acquire()).toThrow(/1 runs at once, 9 per minute/);
});
