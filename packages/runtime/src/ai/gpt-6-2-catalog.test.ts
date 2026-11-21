import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { getModel, getModels } from "@earendil-works/pi-ai/compat";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

type ModelId = Parameters<typeof getModel>[1];
type ProviderId = Parameters<typeof getModel>[0];

const SOL_COST = {
  input: 2,
  output: 10,
  cacheRead: 0.1,
  cacheWrite: 2.5,
  tiers: [
    {
      inputTokensAbove: 272_000,
      input: 4,
      output: 15,
      cacheRead: 0.2,
      cacheWrite: 5,
    },
  ],
};
const ASTRA_COST = {
  input: 8,
  output: 40,
  cacheRead: 0.4,
  cacheWrite: 10,
  tiers: [
    {
      inputTokensAbove: 272_000,
      input: 16,
      output: 60,
      cacheRead: 0.8,
      cacheWrite: 20,
    },
  ],
};

const ROWS: ReadonlyArray<{
  provider: ProviderId;
  id: string;
  sibling: string;
  contextWindow: number;
  cost: typeof SOL_COST;
}> = [
  {
    provider: "openai-codex",
    id: "gpt-6.2-sol",
    sibling: "gpt-6.1-sol",
    contextWindow: 500_000,
    cost: SOL_COST,
  },
  {
    provider: "openai-codex",
    id: "gpt-6.2-astra",
    sibling: "gpt-6.1-sol",
    contextWindow: 272_000,
    cost: ASTRA_COST,
  },
  {
    provider: "azure-openai-responses",
    id: "gpt-6.2-sol",
    sibling: "gpt-6.1-sol",
    contextWindow: 1_050_000,
    cost: SOL_COST,
  },
  {
    provider: "azure-openai-responses",
    id: "gpt-6.2-astra",
    sibling: "gpt-6.1-sol",
    contextWindow: 1_050_000,
    cost: ASTRA_COST,
  },
  {
    provider: "openrouter",
    id: "openai/gpt-6.2-sol",
    sibling: "openai/gpt-6.1-sol",
    contextWindow: 1_050_000,
    cost: SOL_COST,
  },
  {
    provider: "openrouter",
    id: "openai/gpt-6.2-astra",
    sibling: "openai/gpt-6.1-sol",
    contextWindow: 1_050_000,
    cost: ASTRA_COST,
  },
];

test.each(
  ROWS,
)("$provider $id carries the published shape on every read path", (row) => {
  const model = getModel(row.provider, row.id as ModelId);
  const sibling = getModel(row.provider, row.sibling as ModelId);
  expect(model).toBeDefined();
  expect(model).toMatchObject({
    id: row.id,
    provider: sibling.provider,
    api: sibling.api,
    baseUrl: sibling.baseUrl,
    contextWindow: row.contextWindow,
    maxTokens: 128_000,
    reasoning: true,
    input: ["text", "image"],
    cost: row.cost,
    compat: sibling.compat,
  });
  expect(getSupportedThinkingLevels(model)).not.toContain("off");
  expect(getSupportedThinkingLevels(model)).toEqual(
    getSupportedThinkingLevels(sibling),
  );
  expect(getModels(row.provider).find((m) => m.id === row.id)).toEqual(model);
  expect(
    builtinProviders()
      .find((p) => p.id === row.provider)
      ?.getModels()
      .find((m) => m.id === row.id),
  ).toEqual(model);
  expect(piModelIds(row.provider)).toContain(row.id);
});

test("the Codex rows send minimal as low, the lowest effort the probe served", () => {
  for (const id of ["gpt-6.2-sol", "gpt-6.2-astra"]) {
    const model = getModel("openai-codex", id as ModelId);
    expect(model.thinkingLevelMap, id).toMatchObject({
      off: null,
      minimal: "low",
      xhigh: "xhigh",
      max: "max",
    });
  }
});
