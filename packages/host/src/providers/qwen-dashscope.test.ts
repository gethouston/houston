import { expect, test } from "vitest";
import { isApiKeyProvider } from "./api-key";
import { buildProviderCatalog } from "./pi-catalog";
import { QWEN_BASE_URL, QWEN_PROVIDER_ID, qwenModels } from "./qwen-dashscope";

test("the catalog advertises qwen as an api-key provider with its models", () => {
  const entry = buildProviderCatalog().find((p) => p.id === QWEN_PROVIDER_ID);
  expect(entry).toBeDefined();
  expect(entry?.name).toBe("Qwen");
  expect(entry?.auth).toBe("apiKey");
  expect(entry?.models.map((m) => m.id)).toContain("qwen3.7-max");
  expect(entry?.models[0]?.id).toBe("qwen3.7-max");
});

test("the api-key connect gate accepts qwen", () => {
  expect(isApiKeyProvider(QWEN_PROVIDER_ID)).toBe(true);
});

test("qwen models are pi's Token Plan Qwen entries on the DashScope url", () => {
  const models = qwenModels();
  expect(models.length).toBeGreaterThan(0);
  for (const m of models) {
    expect(m.id.startsWith("qwen")).toBe(true);
    expect(m.provider).toBe(QWEN_PROVIDER_ID);
    expect(m.baseUrl).toBe(QWEN_BASE_URL);
  }
});
