import { expect, test } from "vitest";
import { RingBuffer } from "./ring-buffer";

test("rejects a non-positive or non-integer capacity", () => {
  expect(() => new RingBuffer(0)).toThrow(RangeError);
  expect(() => new RingBuffer(-1)).toThrow(RangeError);
  expect(() => new RingBuffer(2.5)).toThrow(RangeError);
});

test("fills up to capacity in insertion order", () => {
  const rb = new RingBuffer<number>(3);
  expect(rb.length).toBe(0);
  rb.push(1);
  rb.push(2);
  expect(rb.length).toBe(2);
  expect(rb.sliceFrom(0)).toEqual([1, 2]);
  rb.push(3);
  expect(rb.length).toBe(3);
  expect(rb.sliceFrom(0)).toEqual([1, 2, 3]);
});

test("once full, push overwrites the oldest and keeps order", () => {
  const rb = new RingBuffer<number>(3);
  for (const n of [1, 2, 3, 4, 5]) rb.push(n);
  expect(rb.length).toBe(3); // never exceeds capacity
  expect(rb.sliceFrom(0)).toEqual([3, 4, 5]); // oldest two dropped
  rb.push(6);
  expect(rb.sliceFrom(0)).toEqual([4, 5, 6]);
});

test("at() reads by logical index; out of range is undefined", () => {
  const rb = new RingBuffer<string>(2);
  rb.push("a");
  rb.push("b");
  rb.push("c"); // wraps: window is now [b, c]
  expect(rb.at(0)).toBe("b");
  expect(rb.at(1)).toBe("c");
  expect(rb.at(-1)).toBeUndefined();
  expect(rb.at(2)).toBeUndefined();
});

test("sliceFrom copies a suffix; a negative start clamps to 0", () => {
  const rb = new RingBuffer<number>(4);
  for (const n of [10, 20, 30, 40, 50]) rb.push(n); // window [20,30,40,50]
  expect(rb.sliceFrom(2)).toEqual([40, 50]);
  expect(rb.sliceFrom(4)).toEqual([]); // at/after the end
  expect(rb.sliceFrom(-3)).toEqual([20, 30, 40, 50]);
  // The returned array is a copy, not a live view.
  const copy = rb.sliceFrom(0);
  copy.push(999);
  expect(rb.sliceFrom(0)).toEqual([20, 30, 40, 50]);
});

test("clear empties the buffer and lets it refill from scratch", () => {
  const rb = new RingBuffer<number>(3);
  for (const n of [1, 2, 3, 4]) rb.push(n);
  rb.clear();
  expect(rb.length).toBe(0);
  expect(rb.sliceFrom(0)).toEqual([]);
  expect(rb.at(0)).toBeUndefined();
  rb.push(7);
  rb.push(8);
  expect(rb.sliceFrom(0)).toEqual([7, 8]);
});

test("stays correct across many wraps (invariant: length capped, order kept)", () => {
  const cap = 8;
  const rb = new RingBuffer<number>(cap);
  const total = cap * 50 + 3;
  for (let i = 1; i <= total; i++) rb.push(i);
  expect(rb.length).toBe(cap);
  const expected = Array.from({ length: cap }, (_, k) => total - cap + 1 + k);
  expect(rb.sliceFrom(0)).toEqual(expected);
});
