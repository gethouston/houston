import { expect, test } from "vitest";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "./effort";

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

test("the reasoning default produces a real thinking level (not OFF)", () => {
  expect(toThinkingLevel(DEFAULT_REASONING_EFFORT)).toBeDefined();
});
