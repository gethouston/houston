import { expect, test } from "vitest";
import { buildProviderCatalog } from "./pi-catalog";

/**
 * Claude Opus 5 ships natively in pi-ai's baked Anthropic catalog as of 0.82.1;
 * Houston carried a local backport patch against 0.82.0, deleted with that bump.
 * The guard stays: Opus 5 is a headline model, and a pi bump that dropped or
 * reshaped its entry would silently strip it from `GET /v1/catalog` — the exact
 * failure that shipped a picker with no models once before.
 */
test("GET /v1/catalog advertises Claude Opus 5 under anthropic", () => {
  const anthropic = buildProviderCatalog().find((p) => p.id === "anthropic");
  expect(anthropic).toBeDefined();
  const opus5 = anthropic?.models.find((m) => m.id === "claude-opus-5");
  expect(opus5).toBeDefined();
  expect(opus5?.name).toBe("Claude Opus 5");
  expect(opus5?.reasoning).toBe(true);
  expect(opus5?.contextWindow).toBe(1_000_000);
  // The full effort ladder, same as Opus 4.8 (the partial thinkingLevelMap
  // extends pi's base set rather than replacing it).
  expect(opus5?.thinkingLevels).toEqual(
    anthropic?.models.find((m) => m.id === "claude-opus-4-8")?.thinkingLevels,
  );
  expect(opus5?.thinkingLevels).toContain("xhigh");
  expect(opus5?.thinkingLevels).toContain("max");
});
