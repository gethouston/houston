import { expect, test } from "vitest";
import "./kimi-k3-catalog-patch";
import { buildProviderCatalog } from "./pi-catalog";

test("GET /v1/catalog advertises Kimi K3 under kimi-coding", () => {
  const kimi = buildProviderCatalog().find((p) => p.id === "kimi-coding");
  expect(kimi).toBeDefined();
  const k3 = kimi?.models.find((m) => m.id === "k3");
  expect(k3).toBeDefined();
  expect(k3?.name).toBe("Kimi K3");
  expect(k3?.reasoning).toBe(true);
  expect(k3?.contextWindow).toBe(1048576);
  // Only `max` thinking survives K3's thinkingLevelMap.
  expect(k3?.thinkingLevels).toContain("max");
});
