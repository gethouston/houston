import { strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import {
  getDefaultModel,
  hydrateProviderCatalog,
  isOpenCatalogProvider,
  validModelOrNull,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

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
