import { strictEqual } from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  modelDisplayName,
  toCanonicalProviderId,
} from "@houston/sdk/provider-catalog";
import {
  modelDisplayLabel,
  providerForModel,
  providerModelLabel,
  providerOffersModel,
} from "../src/lib/model-labels.ts";
import { PROVIDER_OVERRIDES } from "../src/lib/provider-overrides.ts";
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

  it("names a model that is runnable but hidden from the picker (B6)", () => {
    // `VALID_MODELS.anthropic` keeps 28 runnable ids while the picker shows 7,
    // so a user pinned to a preserved one has no catalog row — the shared
    // display table still knows its name.
    strictEqual(getModel("anthropic", "claude-opus-4-6"), undefined);
    strictEqual(modelDisplayLabel("anthropic", "claude-opus-4-6"), "Opus 4.6");
  });

  it("never renders a raw model id (B6: the reported bug)", () => {
    // A dated snapshot pin: no catalog row, no curated name, and before the fix
    // the quota card, the picker trigger and the routine screen all printed
    // this string verbatim at the user.
    strictEqual(
      modelDisplayLabel("anthropic", "claude-sonnet-4-5-20250929"),
      "Claude Sonnet 4.5 (2025-09-29)",
    );
    strictEqual(
      modelDisplayLabel("anthropic", "some-unlisted-model"),
      "Some Unlisted Model",
    );
  });

  it("is null only for an empty model id", () => {
    strictEqual(modelDisplayLabel("anthropic", ""), null);
  });
});

/**
 * B6 — the picker labels and the shared display table used to be two hand-synced
 * copies of the same names. There is now ONE table, so the guard is that every
 * model the app curates resolves through it.
 */
describe("curated picker labels come from the shared display table", () => {
  it("names every curated model, under its CANONICAL provider id", () => {
    for (const [displayId, override] of Object.entries(PROVIDER_OVERRIDES)) {
      const canonical = toCanonicalProviderId(displayId);
      for (const modelId of Object.keys(override.models ?? {})) {
        const name = modelDisplayName(canonical, modelId);
        strictEqual(
          typeof name,
          "string",
          `MODEL_DISPLAY["${canonical}"] has no name for the curated "${modelId}"`,
        );
      }
    }
  });

  it("has no per-model label left in the app overrides", () => {
    for (const override of Object.values(PROVIDER_OVERRIDES)) {
      for (const [modelId, model] of Object.entries(override.models ?? {})) {
        strictEqual(
          "label" in model,
          false,
          `"${modelId}" still carries an app-side label; names live in @houston/domain`,
        );
      }
    }
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

describe("providerOffersModel", () => {
  it("is true only for the provider that lists the id", () => {
    strictEqual(providerOffersModel("anthropic", "claude-opus-5"), true);
    // OpenRouter's id for the same model is not Anthropic's (PRODUCT-1657).
    strictEqual(
      providerOffersModel("anthropic", "anthropic/claude-opus-5"),
      false,
    );
    strictEqual(providerOffersModel("nope", "claude-opus-5"), false);
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
