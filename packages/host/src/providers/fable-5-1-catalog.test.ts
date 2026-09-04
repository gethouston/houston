import { expect, test } from "vitest";
import { buildProviderCatalog } from "./pi-catalog";

/**
 * Claude Fable 5.1 ships natively in pi-ai's baked Anthropic catalog as of
 * 0.85.0; Houston carried a local backport patch against 0.84.4, deleted with
 * that bump. The guard stays: Fable 5.1 is the headline model, and a pi bump
 * that dropped or reshaped its entry would silently strip it from
 * `GET /v1/catalog`.
 */
test("GET /v1/catalog advertises Claude Fable 5.1 under anthropic", () => {
  const anthropic = buildProviderCatalog().find((p) => p.id === "anthropic");
  expect(anthropic).toBeDefined();
  const fable51 = anthropic?.models.find((m) => m.id === "claude-fable-5-1");
  expect(fable51).toBeDefined();
  expect(fable51?.name).toBe("Claude Fable 5.1");
  expect(fable51?.reasoning).toBe(true);
  expect(fable51?.contextWindow).toBe(1_000_000);
  expect(fable51?.maxTokens).toBe(128_000);
  // Same per-token price as Fable 5; only cache reads dropped ($1 → $0.25).
  expect(fable51?.pricing).toEqual({
    input: 10,
    output: 50,
    cacheRead: 0.25,
    cacheWrite: 12.5,
  });
  // Same effort ladder as Fable 5 (thinking always on — no "off" level).
  expect(fable51?.thinkingLevels).toEqual(
    anthropic?.models.find((m) => m.id === "claude-fable-5")?.thinkingLevels,
  );
  expect(fable51?.thinkingLevels).toContain("xhigh");
  expect(fable51?.thinkingLevels).toContain("max");
  expect(fable51?.thinkingLevels).not.toContain("off");
});
