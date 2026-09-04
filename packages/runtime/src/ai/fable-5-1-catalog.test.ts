import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

/**
 * Claude Fable 5.1 ships natively in pi-ai's baked Anthropic catalog as of
 * 0.85.0; Houston carried a local backport patch against 0.84.4, deleted with
 * that bump. The guard stays: a pi bump that dropped or reshaped its entry
 * would silently strip the headline model from the runnable set.
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
