import { expect, test } from "vitest";
import { buildProviderCatalog } from "./pi-catalog";

/**
 * Claude Opus 5.5 and Sonnet 5.5 ship natively in pi-ai's baked Anthropic
 * catalog as of 0.99.1. They are the newest headline rows, and a pi bump that
 * dropped or reshaped either would silently strip it from `GET /v1/catalog` —
 * the exact failure that shipped a picker with no models once before.
 */
const ROWS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
] as const;

test("GET /v1/catalog advertises Claude Opus 5.5 and Sonnet 5.5 under anthropic", () => {
  const anthropic = buildProviderCatalog().find((p) => p.id === "anthropic");
  expect(anthropic).toBeDefined();
  for (const { id, name } of ROWS) {
    const row = anthropic?.models.find((m) => m.id === id);
    expect(row, id).toBeDefined();
    expect(row?.name, id).toBe(name);
    expect(row?.reasoning, id).toBe(true);
    expect(row?.contextWindow, id).toBe(1_000_000);
    // Always-thinking with a LOW floor: pi's map nulls both "off" and
    // "minimal", unlike Opus 5 (which keeps "minimal"), so the effort
    // selector starts at low.
    expect(row?.thinkingLevels, id).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  }
});
