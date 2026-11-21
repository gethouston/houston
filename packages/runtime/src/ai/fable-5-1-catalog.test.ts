import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

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
