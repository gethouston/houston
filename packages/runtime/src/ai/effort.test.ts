import { expect, test } from "bun:test";
import { DEFAULT_REASONING_EFFORT, toThinkingLevel } from "./effort";

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

test("the reasoning default produces a real thinking level (not OFF)", () => {
  // A reasoning-capable model with no chosen effort defaults to
  // DEFAULT_REASONING_EFFORT. pi enables reasoning only when a level is set
  // (enable_thinking = !!reasoningEffort), so the default MUST map to a defined
  // level or "thinking" models (e.g. an OpenCode toggle model) silently run with
  // reasoning OFF — the exact bug this default exists to prevent.
  expect(toThinkingLevel(DEFAULT_REASONING_EFFORT)).toBeDefined();
});
