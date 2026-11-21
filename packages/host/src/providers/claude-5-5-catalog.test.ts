import { expect, test } from "vitest";
import { buildProviderCatalog } from "./pi-catalog";

const ROWS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
] as const;

test("GET /v1/catalog advertises Claude Opus, Sonnet and Haiku 5.5 under anthropic", () => {
  const anthropic = buildProviderCatalog().find((p) => p.id === "anthropic");
  expect(anthropic).toBeDefined();
  for (const { id, name } of ROWS) {
    const row = anthropic?.models.find((m) => m.id === id);
    expect(row, id).toBeDefined();
    expect(row?.name, id).toBe(name);
    expect(row?.reasoning, id).toBe(true);
    expect(row?.contextWindow, id).toBe(1_000_000);
    expect(row?.thinkingLevels, id).toEqual([
      ...(id === "claude-haiku-5-5" ? ["off"] : []),
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  }
});
