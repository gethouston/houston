import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  costBucket,
  labsInCatalog,
  memoryBucket,
} from "../src/components/ai-hub/facets.ts";
import type { CatalogModel } from "../src/lib/ai-hub/catalog-types.ts";

describe("costBucket", () => {
  const withInput = (...prices: (number | undefined)[]): CatalogModel => ({
    key: "m",
    name: "m",
    lab: "other",
    reasoning: false,
    toolCall: false,
    imageGen: false,
    inputModalities: [],
    offers: prices.map((costInput, i) => ({
      providerId: `p${i}`,
      modelId: `p${i}-model`,
      subscription: costInput == null,
      ...(costInput != null ? { costInput } : {}),
    })),
  });

  it("buckets a genuinely free ($0) offer as free, above the meter tiers", () => {
    strictEqual(costBucket(withInput(0)), "free");
    // Cheapest across offers wins: a $0 offer beside a paid one is still free.
    strictEqual(costBucket(withInput(5, 0)), "free");
  });

  it("maps the meter tiers 1/2/3 onto low/mid/high", () => {
    strictEqual(costBucket(withInput(0.5)), "low");
    strictEqual(costBucket(withInput(2)), "mid");
    strictEqual(costBucket(withInput(10)), "high");
  });

  it("lands a subscription-only / unpriced model in mid, like the meter", () => {
    strictEqual(costBucket(withInput(undefined)), "mid");
  });
});

describe("memoryBucket", () => {
  it("buckets context windows at the 200K and 1M boundaries", () => {
    strictEqual(memoryBucket(128_000), "small");
    strictEqual(memoryBucket(199_999), "small");
    strictEqual(memoryBucket(200_000), "mid");
    strictEqual(memoryBucket(512_000), "mid");
    strictEqual(memoryBucket(999_999), "mid");
    strictEqual(memoryBucket(1_000_000), "long");
    strictEqual(memoryBucket(2_000_000), "long");
  });

  it("reads absent or invalid context as small (never over-claims)", () => {
    strictEqual(memoryBucket(undefined), "small");
    strictEqual(memoryBucket(Number.NaN), "small");
  });
});

describe("labsInCatalog", () => {
  const model = (lab: CatalogModel["lab"]): CatalogModel => ({
    key: lab + Math.random(),
    name: lab,
    lab,
    reasoning: false,
    toolCall: false,
    imageGen: false,
    inputModalities: [],
    offers: [],
  });

  it("returns each lab once, most-populated first", () => {
    const labs = labsInCatalog([
      model("openai"),
      model("anthropic"),
      model("anthropic"),
      model("anthropic"),
      model("openai"),
    ]);
    deepStrictEqual(labs, ["anthropic", "openai"]);
  });

  it("breaks count ties on the lab id for a stable order", () => {
    const labs = labsInCatalog([model("openai"), model("anthropic")]);
    deepStrictEqual(labs, ["anthropic", "openai"]);
  });

  it("is empty for an empty catalog", () => {
    deepStrictEqual(labsInCatalog([]), []);
  });
});
