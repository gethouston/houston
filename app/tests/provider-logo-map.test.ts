import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  BRAND_KEYS,
  hasProviderBrandMark,
  monogramText,
  providerBrandKey,
} from "../src/components/shell/provider-logo-map.ts";

/**
 * Every provider id pi-ai exposes today (from `@earendil-works/pi-ai`'s catalog),
 * plus Houston's appended local provider. The frontend renames `openai-codex`
 * -> `openai` and drops pi's colliding api-key `openai` before these reach the
 * logo dispatcher, but the resolver stays tolerant of both spellings.
 */
const PI_PROVIDER_IDS = [
  "amazon-bedrock",
  "ant-ling",
  "anthropic",
  "azure-openai-responses",
  "cerebras",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "deepseek",
  "fireworks",
  "github-copilot",
  "google",
  "google-vertex",
  "groq",
  "huggingface",
  "kimi-coding",
  "minimax",
  "minimax-cn",
  "mistral",
  "moonshotai",
  "moonshotai-cn",
  "nvidia",
  "openai",
  "openai-codex",
  "opencode",
  "opencode-go",
  "openrouter",
  "together",
  "vercel-ai-gateway",
  "xai",
  "xiaomi",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-sgp",
  "zai",
  "zai-coding-cn",
  "openai-compatible",
] as const;

describe("providerBrandKey", () => {
  it("resolves every provider id to a brand mark OR the monogram (never throws)", () => {
    for (const id of PI_PROVIDER_IDS) {
      const key = providerBrandKey(id);
      // Either a known brand key, or null (the caller draws a monogram). The
      // monogram itself always yields a non-empty mark.
      if (key !== null) {
        strictEqual(BRAND_KEYS.has(key), true, `unknown key for ${id}: ${key}`);
      }
      strictEqual(monogramText(id).length >= 1, true);
    }
  });

  it("maps regional/variant ids onto their parent brand", () => {
    strictEqual(providerBrandKey("minimax-cn"), "minimax");
    strictEqual(providerBrandKey("moonshotai-cn"), "moonshotai");
    strictEqual(providerBrandKey("kimi-coding"), "moonshotai");
    strictEqual(providerBrandKey("zai-coding-cn"), "zai");
    strictEqual(providerBrandKey("google-vertex"), "google");
    strictEqual(providerBrandKey("opencode-go"), "opencode");
    strictEqual(providerBrandKey("openai-codex"), "openai");
    strictEqual(providerBrandKey("cloudflare-workers-ai"), "cloudflare");
    strictEqual(providerBrandKey("cloudflare-ai-gateway"), "cloudflare");
    strictEqual(providerBrandKey("vercel-ai-gateway"), "vercel");
  });

  it("maps AI-hub lab ids that differ from the provider id", () => {
    strictEqual(providerBrandKey("gemini"), "google");
    strictEqual(providerBrandKey("amazon"), "amazon-bedrock");
    strictEqual(providerBrandKey("moonshot"), "moonshotai");
  });

  it("draws bespoke marks for the well-known providers", () => {
    for (const id of [
      "anthropic",
      "openai",
      "google",
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
    ]) {
      strictEqual(hasProviderBrandMark(id), true, `expected mark for ${id}`);
    }
  });

  it("falls back to the monogram for ids with no bespoke art", () => {
    for (const id of [
      "ant-ling",
      "azure-openai-responses",
      "xiaomi",
      "xiaomi-token-plan-ams",
      "xiaomi-token-plan-cn",
      "xiaomi-token-plan-sgp",
    ]) {
      strictEqual(providerBrandKey(id), null, `expected monogram for ${id}`);
    }
  });
});

describe("monogramText", () => {
  it("keeps a pre-shortened 1-2 char mark verbatim, uppercased", () => {
    strictEqual(monogramText("SQ"), "SQ");
    strictEqual(monogramText("x"), "X");
  });

  it("collapses a longer id or name to its first letter", () => {
    strictEqual(monogramText("ant-ling"), "A");
    strictEqual(monogramText("azure-openai-responses"), "A");
    strictEqual(monogramText("Xiaomi"), "X");
  });

  it("strips separators and survives an empty seed", () => {
    strictEqual(monogramText("--"), "?");
    strictEqual(monogramText(""), "?");
  });

  it("covers every pi id without producing an empty mark", () => {
    for (const id of PI_PROVIDER_IDS) {
      const text = monogramText(id);
      strictEqual(text.length >= 1 && text.length <= 2, true, `bad mark ${id}`);
    }
  });
});

// A sanity net: the brand-key set the resolver validates against must match the
// keys the registry binds. (Registry lives in the .tsx; this asserts the count
// the map file publishes so a stray key addition is caught here too.)
describe("BRAND_KEYS", () => {
  it("has the expected 22 bespoke marks", () => {
    strictEqual(BRAND_KEYS.size, 22);
  });

  it("includes the alias-only keys reached from variant ids", () => {
    deepStrictEqual(
      [BRAND_KEYS.has("vercel"), BRAND_KEYS.has("cloudflare")],
      [true, true],
    );
  });
});
