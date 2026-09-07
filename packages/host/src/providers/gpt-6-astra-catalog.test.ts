import { expect, test } from "vitest";
import { buildProviderCatalog } from "./pi-catalog";

/**
 * GPT-6 Astra ships natively in pi-ai's baked OpenAI catalogs as of 0.85.1;
 * Houston carried a local backport patch against 0.85.0, deleted with that
 * bump. The guard stays: Astra is the OpenAI headline model, and a pi bump
 * that dropped or reshaped its entry would silently strip it from
 * `GET /v1/catalog`.
 */
test("GET /v1/catalog advertises GPT-6 Astra under openai-codex", () => {
  const codex = buildProviderCatalog().find((p) => p.id === "openai-codex");
  expect(codex).toBeDefined();
  const astra = codex?.models.find((m) => m.id === "gpt-6-astra");
  expect(astra).toBeDefined();
  expect(astra?.name).toBe("GPT-6 Astra");
  expect(astra?.reasoning).toBe(true);
  expect(astra?.vision).toBe(true);
  // 272k is the standard-price tier Codex sizes against; the protocol's
  // MODEL_WINDOW_OVERRIDES snaps the usage bar up to the 1M window.
  expect(astra?.contextWindow).toBe(272_000);
  expect(astra?.maxTokens).toBe(128_000);
  expect(astra?.pricing).toMatchObject({
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite: 12.5,
  });
  // The API rejects `reasoning.effort: "none"`, so there is no "off" level;
  // the ladder runs low→max.
  expect(astra?.thinkingLevels).not.toContain("off");
  expect(astra?.thinkingLevels).toContain("xhigh");
  expect(astra?.thinkingLevels).toContain("max");
});

test("GET /v1/catalog advertises GPT-6 Astra under azure-openai-responses", () => {
  const azure = buildProviderCatalog().find(
    (p) => p.id === "azure-openai-responses",
  );
  const astra = azure?.models.find((m) => m.id === "gpt-6-astra");
  expect(astra).toBeDefined();
  expect(astra?.reasoning).toBe(true);
  expect(astra?.maxTokens).toBe(128_000);
  expect(astra?.thinkingLevels).toContain("max");
});
