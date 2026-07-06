import { ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import {
  getDefaultModel,
  getModel,
  getProvider,
  hydrateProviderCatalog,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

// The Copilot model list is hydrated from pi + the override now, so populate it.
before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

// HOU-578: GitHub Copilot Free serves only BASE models via the editor API;
// premium models (Claude / GPT-5.x / Gemini) need Copilot Pro and 404
// `model_not_supported` on Free. The picker therefore MUST offer at least one
// base model, and the default MUST be one — otherwise a Free user lands on a
// model that can never answer, with nothing usable to switch to.
const BASE_MODEL = "gpt-4.1";

describe("GitHub Copilot model picker (HOU-578)", () => {
  it("offers the gpt-4.1 base model — the one option that works on Copilot Free", () => {
    const models = getProvider("github-copilot")?.models ?? [];
    ok(
      models.some((m) => m.id === BASE_MODEL),
      "github-copilot picker must include the gpt-4.1 base model so a Free user has a usable option",
    );
  });

  it("defaults Copilot to the base model, not a Pro-only premium one", () => {
    // The default a fresh Copilot connect lands on must work on every plan.
    strictEqual(getDefaultModel("github-copilot"), BASE_MODEL);
  });

  it("resolves the base model to a labelled catalog entry (selectable + named)", () => {
    const model = getModel("github-copilot", BASE_MODEL);
    ok(model, "gpt-4.1 must resolve in the Copilot catalog");
    ok(model?.label, "gpt-4.1 must have a display label for the picker");
  });

  it("is the model the model_unavailable card's 'Switch to gpt-4.1' fallback points at", () => {
    // The runtime classifier (ai/provider-error.ts COPILOT_BASE_FALLBACK) names
    // gpt-4.1 as the suggested_fallback; that id must be a real picker entry so
    // the card's switch button lands the user on a working model.
    ok(getModel("github-copilot", BASE_MODEL));
  });
});
