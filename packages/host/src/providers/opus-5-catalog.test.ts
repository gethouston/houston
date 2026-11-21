import { expect, test } from "vitest";
import { buildProviderCatalog } from "./pi-catalog";

test("GET /v1/catalog advertises Claude Opus 5 under anthropic", () => {
  const anthropic = buildProviderCatalog().find((p) => p.id === "anthropic");
  expect(anthropic).toBeDefined();
  const opus5 = anthropic?.models.find((m) => m.id === "claude-opus-5");
  expect(opus5).toBeDefined();
  expect(opus5?.name).toBe("Claude Opus 5");
  expect(opus5?.reasoning).toBe(true);
  expect(opus5?.contextWindow).toBe(1_000_000);
  expect(opus5?.thinkingLevels).toEqual([
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
});
