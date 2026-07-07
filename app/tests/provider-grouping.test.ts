import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  filterByQuickFilter,
  orderFeaturedFirst,
  searchProviders,
} from "../src/components/ai-hub/provider-filtering.ts";
import {
  authChipKey,
  connectCardByGatewayId,
  groupProviders,
  offerForProvider,
  providerDescriptionKey,
  providerModels,
} from "../src/components/ai-hub/provider-grouping.ts";
import type {
  CatalogModel,
  CatalogOffer,
  HubCatalog,
} from "../src/lib/ai-hub/catalog-types.ts";
import {
  PROVIDER_OVERRIDES,
  providerCostLine,
} from "../src/lib/provider-overrides.ts";
import type { ProviderInfo } from "../src/lib/providers.ts";

function provider(id: string, extra: Partial<ProviderInfo> = {}): ProviderInfo {
  return { id, name: id, ...extra } as ProviderInfo;
}

function model(key: string, offers: CatalogOffer[] = []): CatalogModel {
  return {
    key,
    name: key,
    lab: "other",
    reasoning: false,
    toolCall: false,
    imageGen: false,
    inputModalities: [],
    offers,
  } as CatalogModel;
}

function catalogOf(byProvider: Record<string, CatalogModel[]>): HubCatalog {
  return {
    models: [],
    byKey: new Map(),
    byProvider: new Map(Object.entries(byProvider)),
    modelCount: 0,
    offerCount: 0,
  };
}

describe("groupProviders", () => {
  it("puts connected first and preserves catalog order within groups", () => {
    const a = provider("a");
    const b = provider("b");
    const c = provider("c");
    const connectedIds = new Set(["b"]);
    const groups = groupProviders([a, b, c], (p) => connectedIds.has(p.id));
    deepStrictEqual(
      groups.connected.map((p) => p.id),
      ["b"],
    );
    deepStrictEqual(
      groups.available.map((p) => p.id),
      ["a", "c"],
    );
  });
});

describe("providerModels", () => {
  it("unions gateway ids and de-duplicates by model key (opencode account)", () => {
    const opencode = provider("opencode", {
      gatewayIds: ["opencode", "opencode-go"],
    });
    const shared = model("glm 5.1");
    const catalog = catalogOf({
      opencode: [model("claude opus 4.8"), shared],
      "opencode-go": [shared, model("kimi k2.6")],
    });
    deepStrictEqual(
      providerModels(catalog, opencode).map((m) => m.key),
      ["claude opus 4.8", "glm 5.1", "kimi k2.6"],
    );
    strictEqual(providerModels(catalog, opencode).length, 3);
  });

  it("uses the card's own id when it has no gateway ids", () => {
    const google = provider("google", { auth: "apiKey" });
    const catalog = catalogOf({ google: [model("gemini 3 flash")] });
    strictEqual(providerModels(catalog, google).length, 1);
  });
});

describe("offerForProvider", () => {
  it("returns the offer whose providerId is one of the card's gateways", () => {
    const opencode = provider("opencode", {
      gatewayIds: ["opencode", "opencode-go"],
    });
    const m = model("x", [
      { providerId: "openrouter", modelId: "x", subscription: false },
      { providerId: "opencode", modelId: "x", subscription: false },
    ]);
    strictEqual(offerForProvider(m, opencode)?.providerId, "opencode");
    strictEqual(offerForProvider(m, provider("deepseek")), undefined);
  });
});

describe("authChipKey", () => {
  it("maps auth kind to the right chip", () => {
    strictEqual(authChipKey(provider("anthropic")), "subscription");
    strictEqual(
      authChipKey(provider("github-copilot", { copilotConnect: true })),
      "subscription",
    );
    strictEqual(
      authChipKey(provider("openai-compatible", { auth: "openaiCompatible" })),
      "local",
    );
    strictEqual(
      authChipKey(provider("openrouter", { auth: "apiKey" })),
      "gateway",
    );
    strictEqual(
      authChipKey(
        provider("opencode", {
          auth: "apiKey",
          gatewayIds: ["opencode", "opencode-go"],
        }),
      ),
      "gateway",
    );
    strictEqual(
      authChipKey(provider("deepseek", { auth: "apiKey" })),
      "apiKey",
    );
  });
});

describe("providerDescriptionKey", () => {
  it("remaps the merged opencode card, passes others through", () => {
    strictEqual(providerDescriptionKey("opencode"), "opencode-account");
    strictEqual(providerDescriptionKey("anthropic"), "anthropic");
  });

  it("falls back to the raw id for an unwired provider (visible, not silent)", () => {
    strictEqual(providerDescriptionKey("brand-new-lab"), "brand-new-lab");
  });
});

describe("orderFeaturedFirst", () => {
  it("pins featured ids in FEATURED order, keeps the rest in catalog order", () => {
    const ordered = orderFeaturedFirst([
      provider("deepseek"),
      provider("google"),
      provider("openrouter"),
      provider("anthropic"),
    ]);
    deepStrictEqual(
      ordered.map((p) => p.id),
      ["anthropic", "google", "deepseek", "openrouter"],
    );
  });

  it("tolerates a featured id being absent (capability-gated local provider)", () => {
    const ordered = orderFeaturedFirst([
      provider("deepseek"),
      provider("openai"),
    ]);
    deepStrictEqual(
      ordered.map((p) => p.id),
      ["openai", "deepseek"],
    );
  });

  it("leaves a featured-free list untouched", () => {
    const ordered = orderFeaturedFirst([
      provider("deepseek"),
      provider("openrouter"),
    ]);
    deepStrictEqual(
      ordered.map((p) => p.id),
      ["deepseek", "openrouter"],
    );
  });
});

describe("searchProviders", () => {
  const list = [
    provider("anthropic", { name: "Anthropic", subtitle: "Claude Code" }),
    provider("openrouter", {
      name: "OpenRouter",
      subtitle: "Any model, one key",
    }),
    provider("google", { name: "Google Gemini", subtitle: "Free key" }),
  ];

  it("returns everything for an empty or whitespace query", () => {
    strictEqual(searchProviders(list, "").length, 3);
    strictEqual(searchProviders(list, "   ").length, 3);
  });

  it("matches name, id, and subtitle case-insensitively", () => {
    deepStrictEqual(
      searchProviders(list, "GEMINI").map((p) => p.id),
      ["google"],
    );
    deepStrictEqual(
      searchProviders(list, "openrouter").map((p) => p.id),
      ["openrouter"],
    );
    deepStrictEqual(
      searchProviders(list, "one key").map((p) => p.id),
      ["openrouter"],
    );
  });

  it("returns an empty list when nothing matches", () => {
    strictEqual(searchProviders(list, "zzz").length, 0);
  });
});

describe("filterByQuickFilter", () => {
  // anthropic → subscription + popular; google → apiKey (payg) + popular + free
  // (curated freeTier); openrouter → gateway (payg) + free (curated freeTier);
  // deepseek → apiKey (payg); openai-compatible → local + popular + free (local
  // costs nothing).
  const list = [
    provider("anthropic"),
    provider("google", { auth: "apiKey" }),
    provider("openrouter", { auth: "apiKey" }),
    provider("deepseek", { auth: "apiKey" }),
    provider("openai-compatible", { auth: "openaiCompatible" }),
  ];

  it("passes everything through for `all`", () => {
    strictEqual(filterByQuickFilter(list, "all").length, 5);
  });

  it("`popular` keeps the featured-pinned providers", () => {
    deepStrictEqual(
      filterByQuickFilter(list, "popular").map((p) => p.id),
      ["anthropic", "google", "openai-compatible"],
    );
  });

  it("`subscription` keeps only OAuth / plan providers", () => {
    deepStrictEqual(
      filterByQuickFilter(list, "subscription").map((p) => p.id),
      ["anthropic"],
    );
  });

  it("`free` keeps curated free tiers and local models", () => {
    deepStrictEqual(
      filterByQuickFilter(list, "free").map((p) => p.id),
      ["google", "openrouter", "openai-compatible"],
    );
  });

  it("`payg` keeps pasted-key and gateway providers", () => {
    deepStrictEqual(
      filterByQuickFilter(list, "payg").map((p) => p.id),
      ["google", "openrouter", "deepseek"],
    );
  });

  it("`local` keeps only providers that run on the user's computer", () => {
    deepStrictEqual(
      filterByQuickFilter(list, "local").map((p) => p.id),
      ["openai-compatible"],
    );
  });

  it("facets overlap: one provider can match several (google → popular, free, payg)", () => {
    const only = (id: string) => (p: ProviderInfo) => p.id === id;
    const google = list.find(only("google"));
    if (!google) throw new Error("google fixture missing");
    strictEqual(filterByQuickFilter([google], "popular").length, 1);
    strictEqual(filterByQuickFilter([google], "free").length, 1);
    strictEqual(filterByQuickFilter([google], "payg").length, 1);
    strictEqual(filterByQuickFilter([google], "subscription").length, 0);
    strictEqual(filterByQuickFilter([google], "local").length, 0);
  });
});

describe("providerCostLine / freeTier", () => {
  it("returns the curated cost prose for a provider that has one", () => {
    strictEqual(providerCostLine("anthropic"), "Your Claude subscription");
    strictEqual(providerCostLine("opencode"), "Pay as you go");
    strictEqual(providerCostLine("google"), "Free tier on your Google account");
  });

  it("returns undefined for an uncurated id or the local provider", () => {
    strictEqual(providerCostLine("brand-new-lab"), undefined);
    strictEqual(providerCostLine("openai-compatible"), undefined);
  });

  it("marks freeTier only on the curated free-tier entries", () => {
    for (const id of [
      "google",
      "openrouter",
      "groq",
      "cerebras",
      "huggingface",
    ]) {
      strictEqual(PROVIDER_OVERRIDES[id].freeTier, true, id);
    }
    strictEqual(PROVIDER_OVERRIDES.anthropic.freeTier, undefined);
    strictEqual(PROVIDER_OVERRIDES.openai.freeTier, undefined);
  });
});

describe("connectCardByGatewayId", () => {
  it("maps both opencode gateways to the one merged account card", () => {
    const map = connectCardByGatewayId();
    strictEqual(map.get("opencode")?.id, "opencode");
    strictEqual(map.get("opencode-go")?.id, "opencode");
  });

  it("maps a plain gateway to its own card and misses unknown ids", () => {
    const map = connectCardByGatewayId();
    strictEqual(map.get("anthropic")?.id, "anthropic");
    strictEqual(map.get("amazon-bedrock")?.id, "amazon-bedrock");
    strictEqual(map.get("not-a-provider"), undefined);
  });
});
