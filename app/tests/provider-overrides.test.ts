import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  DESCRIPTION_BY_ID,
  DROP_PI_PROVIDERS,
  FEATURED_PROVIDER_IDS,
  PROVIDER_OVERRIDES,
  providerDescription,
} from "../src/lib/provider-overrides.ts";

describe("FEATURED_PROVIDER_IDS", () => {
  it("lists the five hub-pinned providers in order", () => {
    strictEqual(FEATURED_PROVIDER_IDS.length, 5);
    strictEqual(FEATURED_PROVIDER_IDS[0], "anthropic");
    strictEqual(FEATURED_PROVIDER_IDS[4], "openai-compatible");
  });
});

describe("providerDescription", () => {
  it("prefers a curated override's description", () => {
    strictEqual(providerDescription("openrouter"), "Any model from one key.");
    strictEqual(
      providerDescription("openai"),
      PROVIDER_OVERRIDES.openai.description,
    );
  });

  it("falls back to DESCRIPTION_BY_ID for uncurated pi providers", () => {
    strictEqual(
      providerDescription("groq"),
      "Ultra-low-latency inference on custom LPU hardware.",
    );
    strictEqual(providerDescription("xai"), "Grok models from xAI.");
    strictEqual(DESCRIPTION_BY_ID.groq, providerDescription("groq"));
  });

  it("resolves a regional *-cn variant to its parent's description", () => {
    // Parent lives in the overrides (minimax) and in the map (moonshotai).
    strictEqual(
      providerDescription("minimax-cn"),
      PROVIDER_OVERRIDES.minimax.description,
    );
    strictEqual(
      providerDescription("moonshotai-cn"),
      DESCRIPTION_BY_ID.moonshotai,
    );
    strictEqual(
      providerDescription("zai-coding-cn"),
      DESCRIPTION_BY_ID["zai-coding"],
    );
  });

  it("covers every provider id the Providers tab surfaces", () => {
    const ids = [
      "anthropic",
      "openai",
      "google",
      "github-copilot",
      "openrouter",
      "opencode",
      "opencode-go",
      "deepseek",
      "amazon-bedrock",
      "minimax",
      "groq",
      "mistral",
      "xai",
      "cerebras",
      "fireworks",
      "together",
      "nvidia",
      "huggingface",
      "moonshotai",
      "zai",
      "vercel-ai-gateway",
      "cloudflare-ai-gateway",
      "cloudflare-workers-ai",
      "azure-openai-responses",
      "google-vertex",
      "openai-compatible",
      "zai-coding-cn",
      "xiaomi",
    ];
    for (const id of ids) {
      const desc = providerDescription(id);
      ok(desc.length > 0, `missing description for ${id}`);
      ok(desc.length <= 60, `description too long for ${id}: ${desc.length}`);
      ok(!desc.includes("—"), `em dash in description for ${id}`);
    }
  });

  it("retired providers are dropped from the catalog, not merely uncurated", () => {
    // 2026-07 provider QA: these cards are gone from every connect/pick
    // surface. The drop is presentation-only (legacy conversations still run),
    // so the ids must sit in DROP_PI_PROVIDERS and carry no override entry.
    for (const id of [
      "ant-ling",
      "kimi-coding",
      "moonshotai-cn",
      "xiaomi-token-plan-ams",
      "xiaomi-token-plan-cn",
      "xiaomi-token-plan-sgp",
    ]) {
      ok(DROP_PI_PROVIDERS.has(id), `${id} must be in DROP_PI_PROVIDERS`);
      strictEqual(
        PROVIDER_OVERRIDES[id],
        undefined,
        `${id} must not keep a curated override`,
      );
    }
  });

  it("returns an empty string for a provider we have never described", () => {
    strictEqual(providerDescription("brand-new-lab"), "");
  });
});

describe("api-key overrides", () => {
  it("every api-key override carries the key-dashboard URL", () => {
    // An api-key connect dialog without `apiKeyUrl` strands the user with no
    // "Get your API key" button (the Mistral/Z.ai reports): if we curate an
    // api-key provider at all, we must curate where its key comes from.
    for (const [id, override] of Object.entries(PROVIDER_OVERRIDES)) {
      if (override.auth === "oauth" || override.auth === "openaiCompatible")
        continue;
      ok(override.apiKeyUrl, `PROVIDER_OVERRIDES["${id}"] needs an apiKeyUrl`);
    }
  });
});
