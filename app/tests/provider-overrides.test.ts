import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  DESCRIPTION_BY_ID,
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
      "cohere",
      "perplexity",
      "vercel-ai-gateway",
      "cloudflare-ai-gateway",
      "cloudflare-workers-ai",
      "azure-openai-responses",
      "google-vertex",
      "ant-ling",
      "openai-compatible",
      "moonshotai-cn",
      "minimax-cn",
      "zai-coding-cn",
      "kimi-coding",
    ];
    for (const id of ids) {
      const desc = providerDescription(id);
      ok(desc.length > 0, `missing description for ${id}`);
      ok(desc.length <= 60, `description too long for ${id}: ${desc.length}`);
      ok(!desc.includes("—"), `em dash in description for ${id}`);
    }
  });

  it("returns an empty string for a provider we have never described", () => {
    strictEqual(providerDescription("brand-new-lab"), "");
  });
});
