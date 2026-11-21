import {
  calculateCost,
  getSupportedThinkingLevels,
  type Usage,
} from "@earendil-works/pi-ai";
import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

type ModelId = Parameters<typeof getModel>[1];
const haiku = () => getModel("anthropic", "claude-haiku-5-5" as ModelId);
const sonnet = () => getModel("anthropic", "claude-sonnet-5-5" as ModelId);

test("Claude Haiku 5.5 is in pi's anthropic catalog", () => {
  const m = haiku();
  expect(m).toBeDefined();
  expect(m?.name).toBe("Claude Haiku 5.5");
  expect(m?.contextWindow).toBe(1_000_000);
  expect(m?.maxTokens).toBe(128_000);
  expect(m?.reasoning).toBe(true);
  expect(m?.input).toEqual(["text", "image"]);
  expect(piModelIds("anthropic")).toContain("claude-haiku-5-5");
});

test("Haiku 5.5 reasons like the rest of the 5.5 lineup", () => {
  const m = haiku();
  const s = sonnet();
  if (!m || !s) throw new Error("catalog rows missing");
  expect(getSupportedThinkingLevels(m)).toEqual([
    "off",
    ...getSupportedThinkingLevels(s),
  ]);
  expect(m.compat).toMatchObject({
    forceAdaptiveThinking: true,
    supportsTemperature: false,
    supportsMidConvoEffort: true,
    supportsMidConvoSystemMessages: true,
    supportsMidConvoToolChanges: true,
  });
});

function usage(input: number, output: number): Usage {
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

test("Haiku 5.5 bills the long-prompt rate card above 100K prompt tokens", () => {
  const m = haiku();
  if (!m) throw new Error("catalog row missing");
  expect(calculateCost(m, usage(100_000, 1_000_000)).total).toBeCloseTo(
    0.01 + 0.5,
  );
  expect(calculateCost(m, usage(200_000, 1_000_000)).total).toBeCloseTo(
    0.1 + 2.5,
  );
});
