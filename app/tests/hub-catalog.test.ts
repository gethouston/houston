import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { loadHubCatalog } from "../src/lib/ai-hub/catalog.ts";
import type { CatalogModel } from "../src/lib/ai-hub/catalog-types.ts";
import { filterModels, searchModels } from "../src/lib/ai-hub/search.ts";

// Every provider the hub can connect to, all visible (new-engine desktop). The
// two OpenCode gateways are both passed; the catalog folds them into one.
const ALL_VISIBLE = [
  "anthropic",
  "openai",
  "github-copilot",
  "opencode",
  "opencode-go",
  "openrouter",
  "deepseek",
  "google",
  "amazon-bedrock",
  "minimax",
];

// The curated ids PROVIDERS lists for each subscription provider. Their offers
// must be EXACTLY these, never the provider's full models.dev list.
const CURATED = {
  anthropic: [
    "claude-fable-5",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
  ],
  openai: ["gpt-5.3-codex-spark", "gpt-5.4", "gpt-5.4-mini", "gpt-5.5"],
} as const;

const all = await loadHubCatalog(ALL_VISIBLE);

function offerProviders(model: CatalogModel | undefined): string[] {
  return (model?.offers ?? []).map((o) => o.providerId).sort();
}

describe("cross-provider key normalization", () => {
  it("merges the anthropic / bedrock / copilot / opencode / openrouter variants of Claude Opus 4.8", () => {
    const opus = all.byKey.get("claude opus 4.8");
    ok(opus, "expected a merged 'claude opus 4.8' model");
    deepStrictEqual(offerProviders(opus), [
      "amazon-bedrock",
      "anthropic",
      "github-copilot",
      "opencode",
      "openrouter",
    ]);
    strictEqual(opus?.lab, "anthropic");
  });

  it("collapses Bedrock regional duplicates into a single offer per provider", () => {
    // Bedrock lists Opus 4.8 six times (au/eu/us/global/jp + base). They share
    // one key and must produce exactly one amazon-bedrock offer, not six.
    const opus = all.byKey.get("claude opus 4.8");
    const bedrock =
      opus?.offers.filter((o) => o.providerId === "amazon-bedrock") ?? [];
    strictEqual(bedrock.length, 1);
    ok(
      !bedrock[0]?.modelId.startsWith("eu."),
      "should keep the cleanest (region-less) Bedrock id",
    );
  });

  it("keeps every offer's key stable so no model appears twice", () => {
    strictEqual(all.byKey.size, all.models.length);
  });
});

describe("catalog coverage (all providers visible)", () => {
  it("exposes hundreds of unique models across every provider", () => {
    // NOTE: the pinned snapshot yields 378 unique models (the spec's estimated
    // 400+ is not reachable: the snapshot has only 393 unique keys total, and
    // subscription providers contribute their curated set, not full lists). The
    // floor below proves the merge stays rich without asserting a false number.
    ok(
      all.modelCount >= 350,
      `expected >= 350 unique models, got ${all.modelCount}`,
    );
    ok(all.offerCount >= 450, `expected >= 450 offers, got ${all.offerCount}`);
    ok(
      all.modelCount < all.offerCount,
      "offers should outnumber unique models (cross-provider merge)",
    );
  });

  it("every visible provider contributes offers", () => {
    for (const id of ALL_VISIBLE) {
      if (id === "opencode-go") continue; // folded into opencode
      ok(
        (all.byProvider.get(id)?.length ?? 0) > 0,
        `provider ${id} should offer at least one model`,
      );
    }
  });

  it("sorts models newest-first", () => {
    const dates = all.models
      .map((m) => m.releaseDate)
      .filter((d): d is string => !!d);
    const sorted = [...dates].sort().reverse();
    deepStrictEqual(dates, sorted);
  });
});

describe("subscription (OAuth) providers offer only curated models", () => {
  it("anthropic offers are exactly the curated ids, all subscription, no price", () => {
    const ids = new Set<string>();
    for (const model of all.models)
      for (const offer of model.offers)
        if (offer.providerId === "anthropic") {
          ids.add(offer.modelId);
          strictEqual(offer.subscription, true);
          strictEqual(offer.costInput, undefined);
          strictEqual(offer.costOutput, undefined);
        }
    deepStrictEqual([...ids].sort(), [...CURATED.anthropic]);
  });

  it("does not expose a non-curated anthropic model (e.g. Claude Opus 4.5)", () => {
    const legacy = all.byKey.get("claude opus 4.5");
    ok(
      !offerProviders(legacy).includes("anthropic"),
      "Opus 4.5 is not in the curated Claude set, so no anthropic offer",
    );
  });

  it("openai offers are exactly the curated ids", () => {
    const ids = new Set<string>();
    for (const model of all.models)
      for (const offer of model.offers)
        if (offer.providerId === "openai") ids.add(offer.modelId);
    deepStrictEqual([...ids].sort(), [...CURATED.openai]);
  });
});

describe("visibility filtering drops offers and models", () => {
  it("keeps only visible providers' offers on a single-provider view", async () => {
    const only = await loadHubCatalog(["openrouter"]);
    deepStrictEqual([...only.byProvider.keys()], ["openrouter"]);
    for (const model of only.models)
      for (const offer of model.offers)
        strictEqual(offer.providerId, "openrouter");
    const opus = only.byKey.get("claude opus 4.8");
    deepStrictEqual(offerProviders(opus), ["openrouter"]);
  });

  it("drops the whole catalog down to curated models on the OAuth-only (legacy engine) set", async () => {
    const oauth = await loadHubCatalog([
      "anthropic",
      "openai",
      "github-copilot",
    ]);
    ok(oauth.modelCount > 0 && oauth.modelCount < 40);
    deepStrictEqual([...oauth.byProvider.keys()].sort(), [
      "anthropic",
      "github-copilot",
      "openai",
    ]);
  });

  it("lights up OpenCode offers when only OpenCode Go is visible (fold)", async () => {
    const go = await loadHubCatalog(["opencode-go"]);
    ok(
      (go.byProvider.get("opencode")?.length ?? 0) > 0,
      "opencode-go visibility should surface the folded opencode offers",
    );
  });

  it("returns an empty catalog when nothing is visible", async () => {
    const none = await loadHubCatalog([]);
    strictEqual(none.modelCount, 0);
    strictEqual(none.offerCount, 0);
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
    inputModalities: [],
    offers: [],
    ...partial,
  };
}
