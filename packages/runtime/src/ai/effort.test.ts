import { test, expect } from "bun:test";
import { toThinkingLevel } from "./effort";

/**
 * Houston's effort vocabulary → pi's thinkingLevel. The only non-identity case
 * is "max" (Houston's top) → "xhigh" (pi's ceiling); unknown/absent → undefined
 * so callers omit the override instead of substituting a level.
 */
test("identity levels pass through", () => {
  expect(toThinkingLevel("minimal")).toBe("minimal");
  expect(toThinkingLevel("low")).toBe("low");
  expect(toThinkingLevel("medium")).toBe("medium");
  expect(toThinkingLevel("high")).toBe("high");
  expect(toThinkingLevel("xhigh")).toBe("xhigh");
});

test("Houston 'max' maps to pi 'xhigh' (pi has no 'max')", () => {
  expect(toThinkingLevel("max")).toBe("xhigh");
});

test("absent or unknown effort → undefined (omit the override)", () => {
  expect(toThinkingLevel(null)).toBeUndefined();
  expect(toThinkingLevel(undefined)).toBeUndefined();
  expect(toThinkingLevel("")).toBeUndefined();
  expect(toThinkingLevel("turbo")).toBeUndefined();
});
