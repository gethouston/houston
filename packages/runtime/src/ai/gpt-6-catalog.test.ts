import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

type ModelId = Parameters<typeof getModel>[1];

/**
 * The GPT-6 line ships natively in pi-ai's baked OpenAI catalogs. Luna is the
 * Codex default every unpinned turn lands on and Astra is the headline tier, so
 * a pi bump that drops or reshapes either entry would silently strip a model
 * Houston's own tables promise from the runnable set.
 */
test("the GPT-6 line is in pi's openai-codex catalog", () => {
  for (const id of ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"])
    expect(piModelIds("openai-codex")).toContain(id);
});

test("GPT-6 Luna carries the Codex default's shape", () => {
  const m = getModel("openai-codex", "gpt-6-luna" as ModelId);
  expect(m).toBeDefined();
  expect(m?.name).toBe("GPT-6 Luna");
  expect(m?.contextWindow).toBe(272_000);
  expect(m?.maxTokens).toBe(128_000);
  expect(m?.reasoning).toBe(true);
  expect(m?.input).toEqual(["text", "image"]);
  expect(m?.cost).toMatchObject({
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  });
  // Long-context pricing kicks in above 272k input tokens.
  expect(m?.cost.tiers).toEqual([
    {
      inputTokensAbove: 272_000,
      input: 0.2,
      output: 0.75,
      cacheRead: 0.02,
      cacheWrite: 0.25,
    },
  ]);
});

test("GPT-6 Astra is in pi's openai-codex catalog", () => {
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
  expect(m?.cost.tiers).toEqual([
    {
      inputTokensAbove: 272_000,
      input: 20,
      output: 75,
      cacheRead: 2,
      cacheWrite: 25,
    },
  ]);
});

test("the GPT-6 line is in pi's azure-openai-responses catalog", () => {
  for (const id of ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"]) {
    const m = getModel("azure-openai-responses", id as ModelId);
    expect(m, id).toBeDefined();
    expect(m?.maxTokens, id).toBe(128_000);
    expect(piModelIds("azure-openai-responses"), id).toContain(id);
  }
  expect(
    getModel("azure-openai-responses", "gpt-6-astra" as ModelId)?.cost,
  ).toEqual({
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite: 12.5,
  });
});
