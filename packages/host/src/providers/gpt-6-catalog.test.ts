import { expect, test } from "vitest";
import { buildProviderCatalog } from "./pi-catalog";

/**
 * The GPT-6 line ships natively in pi-ai's baked OpenAI catalogs. Luna is the
 * Codex default every unpinned turn lands on and Astra is the headline tier, so
 * a pi bump that dropped or reshaped either entry would silently strip it from
 * `GET /v1/catalog`.
 */
test("GET /v1/catalog advertises the GPT-6 line under openai-codex", () => {
  const codex = buildProviderCatalog().find((p) => p.id === "openai-codex");
  expect(codex).toBeDefined();
  for (const id of ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"])
    expect(
      codex?.models.map((m) => m.id),
      id,
    ).toContain(id);

  const luna = codex?.models.find((m) => m.id === "gpt-6-luna");
  expect(luna?.name).toBe("GPT-6 Luna");
  expect(luna?.reasoning).toBe(true);
  expect(luna?.vision).toBe(true);
  expect(luna?.contextWindow).toBe(272_000);
  expect(luna?.maxTokens).toBe(128_000);
  expect(luna?.pricing).toMatchObject({
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  });
  // Luna maps `off` to the API's own `none` effort, so thinking can be turned
  // all the way off — Astra below has no such row.
  expect(luna?.thinkingLevels).toContain("off");
  expect(luna?.thinkingLevels).toContain("max");
});

test("GET /v1/catalog advertises GPT-6 Astra under openai-codex", () => {
  const codex = buildProviderCatalog().find((p) => p.id === "openai-codex");
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

test("GET /v1/catalog advertises the GPT-6 line under azure-openai-responses", () => {
  const azure = buildProviderCatalog().find(
    (p) => p.id === "azure-openai-responses",
  );
  for (const id of ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"]) {
    const m = azure?.models.find((row) => row.id === id);
    expect(m, id).toBeDefined();
    expect(m?.reasoning, id).toBe(true);
    expect(m?.maxTokens, id).toBe(128_000);
    expect(m?.thinkingLevels, id).toContain("max");
  }
});
