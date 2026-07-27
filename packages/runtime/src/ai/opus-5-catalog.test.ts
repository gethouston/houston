import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

/**
 * Claude Opus 5 ships natively in pi-ai's baked Anthropic catalog as of 0.82.1;
 * Houston carried a local backport patch against 0.82.0, deleted with that bump.
 * The guard stays: Opus 5 is a headline model, and a pi bump that dropped or
 * reshaped its entry would silently strip it from the runnable set.
 */
test("Claude Opus 5 is in pi's anthropic catalog", () => {
  const m = getModel(
    "anthropic",
    "claude-opus-5" as Parameters<typeof getModel>[1],
  );
  expect(m).toBeDefined();
  expect(m?.name).toBe("Claude Opus 5");
  expect(m?.contextWindow).toBe(1_000_000);
  expect(m?.maxTokens).toBe(128_000);
  expect(m?.reasoning).toBe(true);
  expect(piModelIds("anthropic")).toContain("claude-opus-5");
});
