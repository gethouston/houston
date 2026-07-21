import { expect, test } from "vitest";
import "./moonshot-k3-catalog-patch";
import { buildProviderCatalog } from "./pi-catalog";

test("GET /v1/catalog advertises Kimi K3 under moonshotai", () => {
  const moonshot = buildProviderCatalog().find((p) => p.id === "moonshotai");
  expect(moonshot).toBeDefined();
  const k3 = moonshot?.models.find((m) => m.id === "kimi-k3");
  expect(k3).toBeDefined();
  expect(k3?.name).toBe("Kimi K3");
  expect(k3?.reasoning).toBe(true);
  expect(k3?.contextWindow).toBe(1048576);
  // Only `max` thinking survives K3's thinkingLevelMap.
  expect(k3?.thinkingLevels).toContain("max");
});
