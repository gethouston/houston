import { expect, test } from "vitest";
import { LruCache } from "./lru";

test("evicts the least-recently-used entry past capacity and fires onEvict", () => {
  const evicted: string[] = [];
  const lru = new LruCache<string, { n: number }>({
    capacity: 2,
    onEvict: (k) => evicted.push(k),
  });
  lru.set("a", { n: 1 });
  lru.set("b", { n: 2 });
  lru.set("c", { n: 3 });

  expect(lru.size).toBe(2);
  expect(lru.has("a")).toBe(false);
  expect(lru.has("b")).toBe(true);
  expect(lru.has("c")).toBe(true);
  expect(evicted).toEqual(["a"]);
});

test("get bumps recency so the refreshed entry survives eviction", () => {
  const lru = new LruCache<string, { n: number }>({ capacity: 2 });
  lru.set("a", { n: 1 });
  lru.set("b", { n: 2 });
  lru.get("a");
  lru.set("c", { n: 3 });

  expect(lru.has("a")).toBe(true);
  expect(lru.has("b")).toBe(false);
});

test("peek does NOT bump recency", () => {
  const lru = new LruCache<string, { n: number }>({ capacity: 2 });
  lru.set("a", { n: 1 });
  lru.set("b", { n: 2 });
  lru.peek("a");
  lru.set("c", { n: 3 });

  expect(lru.has("a")).toBe(false);
  expect(lru.has("b")).toBe(true);
});

test("a pinned entry is never evicted even when it is the oldest", () => {
  const lru = new LruCache<string, { pinned: boolean }>({
    capacity: 1,
    isPinned: (_k, v) => v.pinned,
  });
  lru.set("live", { pinned: true });
  lru.set("idle", { pinned: false });

  lru.set("idle2", { pinned: false });
  expect(lru.has("live")).toBe(true);
  expect(lru.has("idle")).toBe(false);
});

test("sweepIdle evicts entries untouched past idleMs, using the injected clock", () => {
  let now = 0;
  const evicted: string[] = [];
  const lru = new LruCache<string, { n: number }>({
    capacity: 100,
    idleMs: 1000,
    now: () => now,
    onEvict: (k) => evicted.push(k),
  });
  lru.set("a", { n: 1 });
  now = 500;
  lru.set("b", { n: 2 });
  now = 1200;
  lru.sweepIdle();

  expect(lru.has("a")).toBe(false);
  expect(lru.has("b")).toBe(true);
  expect(evicted).toEqual(["a"]);
});

test("sweepIdle spares a pinned entry no matter how idle", () => {
  let now = 0;
  const lru = new LruCache<string, { pinned: boolean }>({
    capacity: 100,
    idleMs: 100,
    now: () => now,
    isPinned: (_k, v) => v.pinned,
  });
  lru.set("busy", { pinned: true });
  now = 10_000;
  lru.sweepIdle();
  expect(lru.has("busy")).toBe(true);
});

test("touch restamps both recency and the idle clock", () => {
  let now = 0;
  const lru = new LruCache<string, { n: number }>({
    capacity: 100,
    idleMs: 1000,
    now: () => now,
  });
  lru.set("a", { n: 1 });
  now = 900;
  lru.touch("a");
  now = 1500;
  lru.sweepIdle();
  expect(lru.has("a")).toBe(true);
});

test("delete and clear drop entries without firing onEvict", () => {
  const evicted: string[] = [];
  const lru = new LruCache<string, { n: number }>({
    capacity: 100,
    onEvict: (k) => evicted.push(k),
  });
  lru.set("a", { n: 1 });
  lru.set("b", { n: 2 });
  expect(lru.delete("a")).toBe(true);
  expect(lru.has("a")).toBe(false);
  lru.clear();
  expect(lru.size).toBe(0);
  expect(evicted).toEqual([]);
});
