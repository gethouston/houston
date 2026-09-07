import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

type ModelId = Parameters<typeof getModel>[1];

/**
 * GPT-6 Astra ships natively in pi-ai's baked OpenAI catalogs as of 0.85.1;
 * Houston carried a local backport patch against 0.85.0, deleted with that
 * bump. The guard stays: a pi bump that dropped or reshaped its entry would
 * silently strip the OpenAI headline model from the runnable set.
 */
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

test("GPT-6 Astra is in pi's azure-openai-responses catalog", () => {
  const m = getModel("azure-openai-responses", "gpt-6-astra" as ModelId);
  expect(m).toBeDefined();
  expect(m?.maxTokens).toBe(128_000);
  expect(m?.cost).toEqual({
    input: 10,
    output: 50,
    cacheRead: 1,
    cacheWrite: 12.5,
  });
  expect(piModelIds("azure-openai-responses")).toContain("gpt-6-astra");
});
