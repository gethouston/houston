import { expect, test } from "vitest";
import "./gemini-flash-catalog-patch";
import { buildProviderCatalog } from "./pi-catalog";

test("GET /v1/catalog advertises the backported Gemini Flash models under google", () => {
  const google = buildProviderCatalog().find((p) => p.id === "google");
  expect(google).toBeDefined();

  const flash36 = google?.models.find((m) => m.id === "gemini-3.6-flash");
  expect(flash36).toBeDefined();
  expect(flash36?.name).toBe("Gemini 3.6 Flash");
  expect(flash36?.reasoning).toBe(true);
  expect(flash36?.contextWindow).toBe(1048576);
  expect(flash36?.pricing).toEqual({
    input: 1.5,
    output: 7.5,
    cacheRead: 0.15,
    cacheWrite: 0,
  });

  const lite35 = google?.models.find((m) => m.id === "gemini-3.5-flash-lite");
  expect(lite35).toBeDefined();
  expect(lite35?.name).toBe("Gemini 3.5 Flash Lite");
  expect(lite35?.pricing.input).toBe(0.3);
});
