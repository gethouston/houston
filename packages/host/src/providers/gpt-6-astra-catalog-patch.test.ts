import { expect, test } from "vitest";
import { buildProviderCatalog } from "./pi-catalog";

test("GET /v1/catalog advertises GPT-6 Astra under openai-codex", () => {
  const codex = buildProviderCatalog().find((p) => p.id === "openai-codex");
  expect(codex).toBeDefined();
  const astra = codex?.models.find((m) => m.id === "gpt-6-astra");
  expect(astra).toBeDefined();
  expect(astra?.name).toBe("GPT-6 Astra");
  expect(astra?.reasoning).toBe(true);
  expect(astra?.vision).toBe(true);
  expect(astra?.contextWindow).toBe(272_000);
  expect(astra?.maxTokens).toBe(128_000);
  expect(astra?.pricing).toEqual({
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite: 12.5,
  });
  // Same effort ladder as GPT-5.6 Sol on Codex: low→max, no `none`.
  expect(astra?.thinkingLevels).toEqual(
    codex?.models.find((m) => m.id === "gpt-5.6-sol")?.thinkingLevels,
  );
  expect(astra?.thinkingLevels).toContain("xhigh");
  expect(astra?.thinkingLevels).toContain("max");
});

test("GET /v1/catalog advertises GPT-6 Astra under azure-openai-responses", () => {
  const azure = buildProviderCatalog().find(
    (p) => p.id === "azure-openai-responses",
  );
  const astra = azure?.models.find((m) => m.id === "gpt-6-astra");
  expect(astra).toBeDefined();
  expect(astra?.contextWindow).toBe(1_050_000);
  expect(astra?.thinkingLevels).not.toContain("off");
  expect(astra?.thinkingLevels).toContain("max");
});
