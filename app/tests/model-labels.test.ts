import { strictEqual } from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  modelDisplayLabel,
  providerForModel,
  providerModelLabel,
} from "../src/lib/model-labels.ts";
import {
  getModel,
  hydrateProviderCatalog,
  providerName,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

// Labels come from the hydrated pi catalog, so populate the cache first.
before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

/**
 * PRODUCT-1475 — the chat picker's trigger and the routine screen's model row
 * name the same pair, so they read it through ONE chain. These pin the chain's
 * order and the local-provider case that motivated it.
 */
describe("modelDisplayLabel", () => {
  it("prefers the catalog's curated label", () => {
    const label = getModel("anthropic", "claude-opus-5")?.label;
    strictEqual(typeof label, "string");
    strictEqual(modelDisplayLabel("anthropic", "claude-opus-5"), label);
  });

  it("falls back to the engine-reported model for a catalog-less provider", () => {
    // A local OpenAI-compatible model has no catalog entry; `active_model` is
    // the only name it has.
    strictEqual(
      modelDisplayLabel("openai-compatible", "", "llama3.1"),
      "llama3.1",
    );
  });

  it("falls back to the raw selection before giving up", () => {
    strictEqual(
      modelDisplayLabel("anthropic", "some-unlisted-model"),
      "some-unlisted-model",
    );
    strictEqual(modelDisplayLabel("anthropic", ""), null);
  });
});

describe("providerForModel", () => {
  it("finds the catalogued provider that offers a model", () => {
    strictEqual(providerForModel("claude-opus-5"), "anthropic");
  });

  it("is null for a model no provider offers", () => {
    strictEqual(providerForModel("not-a-real-model"), null);
  });
});

describe("providerModelLabel", () => {
  it("names the account AND the model", () => {
    const model = getModel("anthropic", "claude-opus-5")?.label;
    strictEqual(
      providerModelLabel("anthropic", "claude-opus-5"),
      `${providerName("anthropic")} · ${model}`,
    );
  });

  it("names the provider alone when the model is unresolved", () => {
    strictEqual(providerModelLabel("anthropic", ""), providerName("anthropic"));
  });

  it("is null with no provider — nothing resolved, nothing to claim", () => {
    strictEqual(providerModelLabel("", "claude-opus-5"), null);
  });
});
