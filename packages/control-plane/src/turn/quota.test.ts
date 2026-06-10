import { test, expect } from "bun:test";
import { TurnQuota, TurnQuotaError } from "./quota";

test("concurrent cap per workspace; other workspaces unaffected", () => {
  const q = new TurnQuota({ maxConcurrent: 2, perHour: 100 });
  const r1 = q.acquire("ws-1");
  q.acquire("ws-1");
  expect(() => q.acquire("ws-1")).toThrow(TurnQuotaError);
  expect(() => q.acquire("ws-2")).not.toThrow();
  r1();
  expect(() => q.acquire("ws-1")).not.toThrow();
});

test("rolling per-hour cap refills as turns age out", () => {
  let t = 0;
  const q = new TurnQuota({ maxConcurrent: 100, perHour: 2 }, () => t);
  q.acquire("ws-1")();
  q.acquire("ws-1")();
  expect(() => q.acquire("ws-1")).toThrow(/per hour/);
  t += 3_600_001;
  expect(() => q.acquire("ws-1")).not.toThrow();
});

test("double release is a no-op", () => {
  const q = new TurnQuota({ maxConcurrent: 1, perHour: 100 });
  const release = q.acquire("ws-1");
  release();
  release();
  q.acquire("ws-1");
  expect(() => q.acquire("ws-1")).toThrow(TurnQuotaError);
});
