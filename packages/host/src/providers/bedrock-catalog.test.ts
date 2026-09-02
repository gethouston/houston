import type { Api, Model } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { PROVIDERS } from "../providers";
import {
  BEDROCK_PROVIDER_ID,
  invokableBedrockModels,
  isInvokableBedrockModelId,
} from "./bedrock-catalog";
import { buildProviderCatalog } from "./pi-catalog";

function bedrockModel(id: string): Model<Api> {
  return {
    id,
    name: id,
    api: "bedrock-converse-stream",
    provider: BEDROCK_PROVIDER_ID,
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 8_192,
  } as Model<Api>;
}

test("keeps global inference profiles and Amazon's own models, in order", () => {
  const kept = invokableBedrockModels([
    bedrockModel("amazon.nova-pro-v1:0"),
    bedrockModel("anthropic.claude-sonnet-4-6"),
    bedrockModel("global.anthropic.claude-sonnet-4-6"),
    bedrockModel("au.anthropic.claude-opus-5"),
    bedrockModel("global.openai.gpt-5.6-sol"),
    bedrockModel("us.anthropic.claude-opus-5"),
  ]).map((m) => m.id);
  expect(kept).toEqual([
    "amazon.nova-pro-v1:0",
    "global.anthropic.claude-sonnet-4-6",
    "global.openai.gpt-5.6-sol",
  ]);
});

test("bare Claude foundation ids and regional profiles are not invokable", () => {
  // Bedrock 400s both on a valid key: the bare id with "on-demand throughput
  // isn't supported", the off-region profile with "The provided model
  // identifier is invalid" (the two failure cards from PRODUCT-1641).
  for (const id of [
    "anthropic.claude-fable-5",
    "anthropic.claude-sonnet-4-6",
    "au.anthropic.claude-opus-5",
    "eu.anthropic.claude-opus-5",
    "jp.anthropic.claude-opus-5",
    "us.anthropic.claude-opus-5",
    "meta.llama3-3-70b-instruct-v1:0",
  ]) {
    expect(isInvokableBedrockModelId(id), id).toBe(false);
  }
  for (const id of [
    "global.anthropic.claude-sonnet-4-6",
    "global.anthropic.claude-opus-5",
    "amazon.nova-pro-v1:0",
    "amazon.nova-lite-v1:0",
  ]) {
    expect(isInvokableBedrockModelId(id), id).toBe(true);
  }
});

test("the served catalog offers Bedrock only invokable ids", () => {
  const bedrock = buildProviderCatalog().find(
    (p) => p.id === BEDROCK_PROVIDER_ID,
  );
  expect(bedrock).toBeDefined();
  const ids = bedrock?.models.map((m) => m.id) ?? [];
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(isInvokableBedrockModelId(id), id).toBe(true);
  // The curated default and a Nova foundation id survive.
  expect(ids).toContain("global.anthropic.claude-sonnet-4-6");
  expect(ids).toContain("amazon.nova-pro-v1:0");
  // The two ids from the PRODUCT-1641 failure cards are gone.
  expect(ids).not.toContain("anthropic.claude-fable-5");
  expect(ids).not.toContain("au.anthropic.claude-opus-5");
});

test("every curated host Bedrock id (incl. the default) survives the filter", () => {
  // The host's curated list and connect default must never name an id the
  // catalog no longer serves — otherwise the picker's default row vanishes.
  const curated = PROVIDERS.find((p) => p.id === BEDROCK_PROVIDER_ID);
  expect(curated).toBeDefined();
  const served = new Set(
    buildProviderCatalog()
      .find((p) => p.id === BEDROCK_PROVIDER_ID)
      ?.models.map((m) => m.id) ?? [],
  );
  for (const id of curated?.models ?? []) expect(served.has(id), id).toBe(true);
  expect(served.has(curated?.defaultModel ?? "")).toBe(true);
});
