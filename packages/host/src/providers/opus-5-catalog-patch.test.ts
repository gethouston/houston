import { expect, test } from "vitest";
import "./opus-5-catalog-patch";
import { buildProviderCatalog } from "./pi-catalog";

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
