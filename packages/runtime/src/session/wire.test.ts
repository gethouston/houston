import { test, expect } from "bun:test";
import { normalizeUsage, toWire } from "./wire";

test("normalizeUsage: context_tokens = totalTokens - output; cached = cacheRead", () => {
  // input 100 + output 20 + cacheRead 300 + cacheWrite 50 = 470 totalTokens.
  // The prompt occupying the window is everything but output: 450.
  expect(
    normalizeUsage({
      input: 100,
      output: 20,
      cacheRead: 300,
      cacheWrite: 50,
      totalTokens: 470,
    }),
  ).toEqual({ context_tokens: 450, output_tokens: 20, cached_tokens: 300 });
});

test("normalizeUsage: missing/garbage usage degrades to null (no misleading zeroes)", () => {
  expect(normalizeUsage(undefined)).toBeNull();
  expect(normalizeUsage(null)).toBeNull();
  expect(normalizeUsage({})).toBeNull();
  expect(normalizeUsage({ output: 5 })).toBeNull(); // no totalTokens
});

test("normalizeUsage: clamps a degenerate output > total to zero, never negative", () => {
  expect(normalizeUsage({ output: 99, cacheRead: 0, totalTokens: 10 })).toEqual(
    {
      context_tokens: 0,
      output_tokens: 99,
      cached_tokens: 0,
    },
  );
});

test("toWire maps turn_end (with usage) to a usage frame", () => {
  expect(
    toWire({
      type: "turn_end",
      turnIndex: 0,
      message: {
        usage: {
          input: 100,
          output: 20,
          cacheRead: 300,
          cacheWrite: 50,
          totalTokens: 470,
        },
      },
      toolResults: [],
    }),
  ).toEqual({
    type: "usage",
    data: { context_tokens: 450, output_tokens: 20, cached_tokens: 300 },
  });
});

test("toWire drops a turn_end whose final message has no usage", () => {
  expect(toWire({ type: "turn_end", message: {} })).toBeNull();
  expect(toWire({ type: "turn_end" })).toBeNull();
});
