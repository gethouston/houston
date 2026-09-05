import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import "./gpt-6-astra-catalog-patch";
import { piModelIds } from "./pi-catalog";

type ModelId = Parameters<typeof getModel>[1];

test("GPT-6 Astra is injected into the openai-codex catalog", () => {
  const m = getModel("openai-codex", "gpt-6-astra" as ModelId);
  expect(m).toBeDefined();
  expect(m?.name).toBe("GPT-6 Astra");
  expect(m?.contextWindow).toBe(272_000);
  expect(m?.maxTokens).toBe(128_000);
  expect(m?.reasoning).toBe(true);
  expect(m?.input).toEqual(["text", "image"]);
  expect(m?.cost).toMatchObject({
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite: 12.5,
  });
  // Long-context pricing kicks in above 272k input tokens.
  expect(m?.cost.tiers).toEqual([
    {
      inputTokensAbove: 272_000,
      input: 20,
      output: 75,
      cacheRead: 2,
      cacheWrite: 25,
    },
  ]);
  expect(piModelIds("openai-codex")).toContain("gpt-6-astra");
});

test("GPT-6 Astra is injected into the azure-openai-responses catalog", () => {
  const m = getModel("azure-openai-responses", "gpt-6-astra" as ModelId);
  expect(m).toBeDefined();
  expect(m?.contextWindow).toBe(1_050_000);
  expect(m?.maxTokens).toBe(128_000);
  expect(m?.cost).toEqual({
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite: 12.5,
  });
  expect(piModelIds("azure-openai-responses")).toContain("gpt-6-astra");
});

test("the patch is idempotent (re-import cannot duplicate the entry)", async () => {
  const { ensureGpt6Astra } = await import("./gpt-6-astra-catalog-patch");
  ensureGpt6Astra();
  ensureGpt6Astra();
  for (const provider of ["openai-codex", "azure-openai-responses"]) {
    const ids = piModelIds(provider).filter((id) => id === "gpt-6-astra");
    expect(ids).toHaveLength(1);
  }
});
