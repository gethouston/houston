import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { loadHubCatalog } from "../src/lib/ai-hub/catalog.ts";
import type { CatalogModel } from "../src/lib/ai-hub/catalog-types.ts";
import { filterModels, searchModels } from "../src/lib/ai-hub/search.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

const all = loadHubCatalog(SAMPLE_CATALOG);

const HOUSTON_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "github-copilot",
  "opencode",
  "opencode-go",
  "openrouter",
  "deepseek",
  "google",
  "amazon-bedrock",
  "minimax",
  "groq",
]);

function offerProviders(model: CatalogModel | undefined): string[] {
  return (model?.offers ?? []).map((o) => o.providerId).sort();
}

describe("offers carry Houston provider ids + pi model ids", () => {
  it("renames openai-codex → openai and preserves the pi model id", () => {
    const astra = all.byKey.get("gpt 6 astra");
    ok(astra, "expected a 'gpt 6 astra' model");
    deepStrictEqual(offerProviders(astra), ["openai"]);
    const openai = astra?.offers.find((o) => o.providerId === "openai");
    strictEqual(openai?.modelId, "gpt-6-astra");
  });

  it("folds one model id served by several gateways into one row", () => {
    const gpt = all.byKey.get("gpt 6.1 sol");
    ok(gpt, "expected a merged 'gpt 6.1 sol' model");
    deepStrictEqual(offerProviders(gpt), [
      "github-copilot",
      "openai",
      "opencode",
    ]);
  });

  it("drops pi's direct api-key openai provider (its models never surface)", () => {
    for (const model of all.models)
      for (const offer of model.offers)
        ok(
          offer.modelId !== "gpt-4o" && offer.modelId !== "gpt-4o-mini",
          "the dropped direct openai provider's models must not appear",
        );
  });

  it("keeps a gateway-prefixed pi model id verbatim on its offer", () => {
    const gemini = all.byKey.get("gemini 3 flash preview");
    const openrouter = gemini?.offers.find(
      (o) => o.providerId === "openrouter",
    );
    strictEqual(openrouter?.modelId, "google/gemini-3-flash-preview");
  });

  it("only ever uses renamed Houston provider ids", () => {
    for (const model of all.models)
      for (const offer of model.offers)
        ok(
          HOUSTON_PROVIDERS.has(offer.providerId),
          `unexpected provider id ${offer.providerId}`,
        );
    deepStrictEqual(
      [...all.byProvider.keys()].sort(),
      [...HOUSTON_PROVIDERS].sort(),
    );
  });
});

describe("pricing and subscription flags come from pi", () => {
  it("marks OAuth (subscription) offers with no per-token price", () => {
    const gpt = all.byKey.get("gpt 6.1 sol");
    const oauth = gpt?.offers.filter((o) => o.subscription) ?? [];
    deepStrictEqual(oauth.map((o) => o.providerId).sort(), [
      "github-copilot",
      "openai",
    ]);
    for (const offer of oauth) {
      strictEqual(offer.costInput, undefined);
      strictEqual(offer.costOutput, undefined);
    }
  });

  it("carries the pi per-1M price on an api-key offer", () => {
    const gpt = all.byKey.get("gpt 5.5");
    const opencode = gpt?.offers.find((o) => o.providerId === "opencode");
    strictEqual(opencode?.subscription, false);
    strictEqual(opencode?.costInput, 1);
    strictEqual(opencode?.costOutput, 2);
  });

  it("offers a curated provider EXACTLY its VISIBLE_MODELS set", () => {
    const ids = new Set<string>();
    for (const model of all.models)
      for (const offer of model.offers)
        if (offer.providerId === "anthropic") ids.add(offer.modelId);
    deepStrictEqual([...ids].sort(), [
      "claude-fable-5-2",
      "claude-haiku-5-5",
      "claude-opus-5-5",
      "claude-sonnet-5-5",
    ]);
  });

  it("hides a curated google model from google while other providers still offer it", () => {
    const gemini = all.byKey.get("gemini 3 flash preview");
    ok(gemini, "expected 'gemini 3 flash preview' via copilot/openrouter");
    ok(!gemini?.offers.some((o) => o.providerId === "google"));
    const ids = new Set<string>();
    for (const model of all.models)
      for (const offer of model.offers)
        if (offer.providerId === "google") ids.add(offer.modelId);
    deepStrictEqual([...ids].sort(), [
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.7-flash",
      "gemini-3.8-flash",
      "gemma-4-26b-a4b-it",
      "gemma-4-31b-it",
    ]);
  });

  it("keeps an API-key gateway's full list", () => {
    ok(all.byKey.get("llama 4 scout"));
    ok(all.byKey.get("llama 3.3 70b"));
  });
});

describe("capabilities map through the pi → hub pipeline", () => {
  it("turns pi vision into an image input modality and keeps reasoning", () => {
    const scout = all.byKey.get("llama 4 scout");
    ok(scout, "expected 'llama 4 scout'");
    ok(scout?.inputModalities.includes("image"), "vision → image modality");
    strictEqual(scout?.reasoning, true);
  });

  it("leaves a non-vision model without the image modality", () => {
    const terra = all.byKey.get("gpt 6.1 terra");
    ok(terra, "expected 'gpt 6.1 terra'");
    ok(!terra?.inputModalities.includes("image"));
  });
});

describe("pi-ai is the runnable set; the snapshot only enriches", () => {
  it("never surfaces a model with no pi offer (no snapshot-only leak)", () => {
    strictEqual(
      all.models.filter((m) => m.offers.length === 0).length,
      0,
      "every hub model must be backed by at least one pi offer",
    );
  });

  it("enriches pi models with snapshot metadata (description / release date)", () => {
    ok(
      all.models.some((m) => m.description),
      "some pi models should gain a snapshot description",
    );
    ok(
      all.models.some((m) => m.releaseDate),
      "some pi models should gain a snapshot release date",
    );
  });

  it("folds cross-provider duplicates by key so offers outnumber models", () => {
    strictEqual(all.byKey.size, all.models.length);
    ok(all.modelCount > 0, "expected a non-empty catalog");
    ok(
      all.offerCount > all.modelCount,
      `offers (${all.offerCount}) should outnumber unique models (${all.modelCount})`,
    );
  });

  it("sorts models newest-first among the dated ones", () => {
    const dates = all.models
      .map((m) => m.releaseDate)
      .filter((d): d is string => !!d);
    const sorted = [...dates].sort().reverse();
    deepStrictEqual(dates, sorted);
  });
});

describe("search ranking and filtering", () => {
  const sample: CatalogModel[] = [
    model({ name: "Super Opus", key: "super opus", lab: "other" }),
    model({ name: "Opus Prime", key: "opus prime", lab: "other" }),
    model({
      name: "Gamma",
      key: "gamma",
      lab: "openai",
      reasoning: true,
      inputModalities: ["text", "image"],
    }),
  ];

  it("ranks name-prefix matches above substring matches", () => {
    const hits = searchModels(sample, "opus");
    deepStrictEqual(
      hits.map((m) => m.name),
      ["Opus Prime", "Super Opus"],
    );
  });

  it("matches on lab when the name does not contain the query", () => {
    const hits = searchModels(sample, "openai");
    deepStrictEqual(
      hits.map((m) => m.name),
      ["Gamma"],
    );
  });

  it("returns the list unchanged for an empty query and nothing for no match", () => {
    strictEqual(searchModels(sample, "   ").length, 3);
    strictEqual(searchModels(sample, "zzzzz").length, 0);
  });

  it("ranks a real prefix match first", () => {
    const hits = searchModels(all.models, "claude");
    ok(hits.length > 0);
    ok(hits[0].name.toLowerCase().startsWith("claude"));
  });

  it("filters by capability and lab", () => {
    strictEqual(filterModels(sample, { reasoning: true }).length, 1);
    strictEqual(filterModels(sample, { vision: true }).length, 1);
    strictEqual(filterModels(sample, { lab: "other" }).length, 2);
    const visionReasoning = filterModels(all.models, {
      reasoning: true,
      vision: true,
    });
    ok(
      visionReasoning.every(
        (m) => m.reasoning && m.inputModalities.includes("image"),
      ),
    );
  });
});

function model(
  partial: Partial<CatalogModel> & Pick<CatalogModel, "name" | "key" | "lab">,
): CatalogModel {
  return {
    reasoning: false,
    toolCall: false,
    imageGen: false,
    inputModalities: [],
    offers: [],
    ...partial,
  };
}
