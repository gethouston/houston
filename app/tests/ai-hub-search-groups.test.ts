import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { CatalogModel } from "../src/lib/ai-hub/catalog-types.ts";
import { searchProvidersWithOffers } from "../src/lib/ai-hub/search-groups.ts";
import type { ProviderInfo } from "../src/lib/providers.ts";

function provider(id: string, name: string): ProviderInfo {
  return { id, name, subtitle: `${name} account` } as ProviderInfo;
}

function model(key: string, name: string, providerIds: string[]): CatalogModel {
  return {
    key,
    name,
    lab: "other",
    reasoning: false,
    toolCall: false,
    imageGen: false,
    inputModalities: [],
    offers: providerIds.map((providerId) => ({
      providerId,
      modelId: key,
      subscription: false,
    })),
  };
}

const providers = [
  provider("openai", "OpenAI"),
  provider("openrouter", "OpenRouter"),
  provider("anthropic", "Anthropic"),
];
const models = [
  model("gpt-5", "GPT-5", ["openai", "openrouter"]),
  model("claude", "Claude Sonnet", ["anthropic"]),
];

describe("searchProvidersWithOffers", () => {
  it("matches a provider by name", () => {
    const result = searchProvidersWithOffers(providers, models, "anthropic");
    deepStrictEqual(
      result.map((item) => item.id),
      ["anthropic"],
    );
  });

  it("widens provider matches through matching model offers", () => {
    const result = searchProvidersWithOffers(providers, models, "gpt-5");
    deepStrictEqual(
      result.map((item) => item.id),
      ["openai", "openrouter"],
    );
  });

  it("widens the connected subset with the same offer rule", () => {
    const connected = [providers[0], providers[2]];
    const result = searchProvidersWithOffers(connected, models, "gpt-5");
    deepStrictEqual(
      result.map((item) => item.id),
      ["openai"],
    );
  });

  it("keeps every provider without a query", () => {
    const result = searchProvidersWithOffers(providers, models, "   ");
    deepStrictEqual(result, providers);
  });
});
