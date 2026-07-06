import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  getDefaultModel,
  isOpenCatalogProvider,
  validModelOrNull,
} from "../src/lib/providers.ts";

describe("isOpenCatalogProvider", () => {
  it("is true for pass-through catalogs (OpenRouter, local endpoint)", () => {
    strictEqual(isOpenCatalogProvider("openrouter"), true);
    strictEqual(isOpenCatalogProvider("openai-compatible"), true);
  });
  it("is false for curated providers and empty input", () => {
    strictEqual(isOpenCatalogProvider("anthropic"), false);
    strictEqual(isOpenCatalogProvider("openai"), false);
    strictEqual(isOpenCatalogProvider(null), false);
    strictEqual(isOpenCatalogProvider(undefined), false);
  });
});

describe("validModelOrNull", () => {
  it("keeps ANY live model id for an open-catalog provider", () => {
    // The bug: a live OpenRouter model that isn't one of the ~5 curated seeds
    // used to null out here, so the effective-model chain reverted the pick to
    // the provider default. It must now pass through verbatim.
    strictEqual(
      validModelOrNull("openrouter", "moonshotai/kimi-k2"),
      "moonshotai/kimi-k2",
    );
    strictEqual(validModelOrNull("openrouter", "x-ai/grok-5"), "x-ai/grok-5");
    strictEqual(
      validModelOrNull("openai-compatible", "my-local-model"),
      "my-local-model",
    );
  });

  it("still rejects unknown ids for a curated provider", () => {
    // Retired / phantom SKUs on a curated provider stay nulled so the chain
    // falls through to a model the server will actually accept.
    strictEqual(validModelOrNull("anthropic", "gpt-5.5-codex"), null);
    strictEqual(validModelOrNull("openai", "not-a-real-model"), null);
  });

  it("accepts a genuinely-listed curated model", () => {
    const m = getDefaultModel("anthropic");
    strictEqual(validModelOrNull("anthropic", m), m);
  });

  it("returns null for empty provider or model", () => {
    strictEqual(validModelOrNull("openrouter", ""), null);
    strictEqual(validModelOrNull("", "x/y"), null);
    strictEqual(validModelOrNull(null, "x/y"), null);
    strictEqual(validModelOrNull("openrouter", null), null);
  });
});
