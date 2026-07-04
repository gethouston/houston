import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  authChipKey,
  connectCardByGatewayId,
  groupProviders,
  offerForProvider,
  providerDescriptionKey,
  providerModelCount,
  providerModels,
} from "../src/components/ai-hub/provider-grouping.ts";
import type {
  CatalogModel,
  CatalogOffer,
  HubCatalog,
} from "../src/lib/ai-hub/catalog-types.ts";
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
    strictEqual(providerModelCount(catalog, opencode), 3);
  });

  it("uses the card's own id when it has no gateway ids", () => {
    const google = provider("google", { auth: "apiKey" });
    const catalog = catalogOf({ google: [model("gemini 3 flash")] });
    strictEqual(providerModelCount(catalog, google), 1);
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
