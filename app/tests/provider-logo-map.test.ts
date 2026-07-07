import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BRAND_KEYS,
  hasProviderBrandMark,
  monogramText,
  providerBrandKey,
} from "../src/components/shell/provider-logo-map.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

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

  it("maps variant ids models.dev defaults on onto a parent brand's real mark", () => {
    strictEqual(providerBrandKey("minimax-cn"), "minimax");
    strictEqual(providerBrandKey("openai-codex"), "openai");
    strictEqual(providerBrandKey("moonshotai-cn"), "moonshotai");
    strictEqual(providerBrandKey("zai-coding-cn"), "zai");
    strictEqual(providerBrandKey("vercel-ai-gateway"), "vercel");
    strictEqual(providerBrandKey("xiaomi-token-plan-ams"), "xiaomi");
    strictEqual(providerBrandKey("xiaomi-token-plan-cn"), "xiaomi");
    strictEqual(providerBrandKey("xiaomi-token-plan-sgp"), "xiaomi");
  });

  it("keeps ids with their OWN models.dev logo as distinct marks", () => {
    // These have a distinct real logo on models.dev, so they are NOT aliased to
    // a parent (Kimi Coding != Moonshot, Vertex AI != Gemini, OpenCode Go !=
    // OpenCode Zen).
    strictEqual(providerBrandKey("kimi-coding"), "kimi-coding");
    strictEqual(providerBrandKey("google-vertex"), "google-vertex");
    strictEqual(providerBrandKey("opencode-go"), "opencode-go");
    strictEqual(
      providerBrandKey("cloudflare-workers-ai"),
      "cloudflare-workers-ai",
    );
    strictEqual(
      providerBrandKey("cloudflare-ai-gateway"),
      "cloudflare-ai-gateway",
    );
    strictEqual(providerBrandKey("xiaomi"), "xiaomi");
    strictEqual(
      providerBrandKey("azure-openai-responses"),
      "azure-openai-responses",
    );
  });

  it("maps AI-hub lab ids that differ from the provider id", () => {
    strictEqual(providerBrandKey("gemini"), "google");
    strictEqual(providerBrandKey("amazon"), "amazon-bedrock");
  });

  it("draws a real models.dev mark for every covered provider id", () => {
    for (const id of [
      "anthropic",
      "ant-ling",
      "cohere",
      "meta",
      "qwen",
      "openai",
      "google",
      "google-vertex",
      "github-copilot",
      "openrouter",
      "amazon-bedrock",
      "opencode",
      "opencode-go",
      "openai-compatible",
      "deepseek",
      "minimax",
      "mistral",
      "groq",
      "cerebras",
      "huggingface",
      "cloudflare-workers-ai",
      "cloudflare-ai-gateway",
      "xai",
      "vercel",
      "nvidia",
      "together",
      "moonshotai",
      "kimi-coding",
      "zai",
      "fireworks",
      "xiaomi",
      "azure-openai-responses",
    ]) {
      strictEqual(hasProviderBrandMark(id), true, `expected mark for ${id}`);
    }
  });

  it("ships a real mark for every Houston provider (no monograms in the list)", () => {
    // `ant-ling` was the last monogram holdout: models.dev serves its generic
    // default for it, so its Ant Group mark ships from LobeHub's icon set
    // instead. An unknown id still resolves to null (the monogram).
    strictEqual(providerBrandKey("ant-ling"), "ant-ling");
    strictEqual(providerBrandKey("some-future-provider"), null);
  });
});

describe("OpenCode provider art", () => {
  it("uses OpenCode's official O mark, not the old Zen Z mark", () => {
    const src = read("../src/components/shell/provider-marks-extra.tsx");
    ok(src.includes("export const OpenCodeLogo"), "OpenCodeLogo exists");
    ok(
      src.includes("M240 300H0V0H240V300ZM180 60H60V240H180V60Z"),
      "OpenCodeLogo draws the official O ring from opencode.ai/brand",
    );
    ok(
      !src.includes("M8.40005 17.4H19.2001V21H4.80005V13.8H8.40005V17.4"),
      "OpenCodeLogo no longer draws the Z-shaped Zen mark",
    );
  });
});

describe("Kimi Coding provider art", () => {
  it("uses Kimi's own currentColor mark, not Moonshot AI's logo", () => {
    const src = read("../src/components/shell/provider-marks-extra.tsx");
    ok(src.includes("export const KimiLogo"), "KimiLogo exists");
    ok(
      src.includes("M9.8132 15.9038L9 18.75L8.1868 15.9038"),
      "KimiLogo draws the Kimi spark mark from models.dev",
    );
    ok(
      src.includes('stroke="currentColor"'),
      "KimiLogo inherits color for light and dark themes",
    );
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
  it("has the expected 32 real brand marks", () => {
    // Most are straight from models.dev's per-provider endpoint; the remaining
    // sourced marks are documented beside `BrandKey`.
    strictEqual(BRAND_KEYS.size, 32);
  });

  it("covers the providers sourced from models.dev", () => {
    deepStrictEqual(
      [
        BRAND_KEYS.has("groq"),
        BRAND_KEYS.has("nvidia"),
        BRAND_KEYS.has("xai"),
        BRAND_KEYS.has("vercel"),
        BRAND_KEYS.has("cloudflare-workers-ai"),
        BRAND_KEYS.has("mistral"),
        BRAND_KEYS.has("fireworks"),
        BRAND_KEYS.has("xiaomi"),
      ],
      [true, true, true, true, true, true, true, true],
    );
  });
});
