import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  FEATURED_PROVIDER_IDS,
  PROVIDER_CATEGORY,
  providerCategory,
} from "../src/lib/provider-overrides.ts";

describe("FEATURED_PROVIDER_IDS", () => {
  it("lists the five hub-pinned providers in order", () => {
    strictEqual(FEATURED_PROVIDER_IDS.length, 5);
    strictEqual(FEATURED_PROVIDER_IDS[0], "anthropic");
    strictEqual(FEATURED_PROVIDER_IDS[4], "openai-compatible");
  });

  it("every featured id maps to the featured category (featured wins)", () => {
    for (const id of FEATURED_PROVIDER_IDS)
      strictEqual(PROVIDER_CATEGORY[id], "featured", id);
  });
});

describe("providerCategory", () => {
  it("returns the explicit bucket for a mapped id", () => {
    strictEqual(providerCategory("openrouter"), "gateway");
    strictEqual(providerCategory("amazon-bedrock"), "local");
    strictEqual(providerCategory("deepseek"), "direct");
    strictEqual(providerCategory("google-vertex"), "regional");
  });

  it("resolves regional deployments by suffix / prefix pattern", () => {
    strictEqual(providerCategory("minimax-cn"), "regional");
    strictEqual(providerCategory("some-provider-sgp"), "regional");
    strictEqual(providerCategory("some-provider-ams"), "regional");
    strictEqual(providerCategory("xiaomi-mimo"), "regional");
  });

  it("defaults an unknown id to direct (never throws)", () => {
    strictEqual(providerCategory("brand-new-lab"), "direct");
  });
});
