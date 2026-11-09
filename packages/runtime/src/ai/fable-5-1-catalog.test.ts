import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

/**
 * Fable 5.1 is no longer in the lineup, but stored 5.1 pins and team ceilings
 * naming it still read this row before they resolve to Fable 5.2 by family. A
 * pi bump that dropped or reshaped it would break that resolution.
 */
test("Claude Fable 5.1 is in pi's anthropic catalog", () => {
  const m = getModel(
    "anthropic",
    "claude-fable-5-1" as Parameters<typeof getModel>[1],
  );
  expect(m).toBeDefined();
  expect(m?.name).toBe("Claude Fable 5.1");
  expect(m?.contextWindow).toBe(1_000_000);
  expect(m?.maxTokens).toBe(128_000);
  expect(m?.reasoning).toBe(true);
  expect(m?.cost).toEqual({
    input: 10,
    output: 50,
    cacheRead: 0.25,
    cacheWrite: 12.5,
  });
  expect(piModelIds("anthropic")).toContain("claude-fable-5-1");
});
