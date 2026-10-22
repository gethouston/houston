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

// HOU-578: plan-gated premium models 404 `model_not_supported` on a plan that
// lacks them. The picker therefore MUST offer the cheapest model every paid
// plan serves (Free and Student get auto model selection only), and the default MUST be it — otherwise a user lands on a model that
// can never answer, with nothing usable to switch to. GitHub retired the
// earlier base models, gpt-4.1 (2026-06-01) and gpt-5-mini (2026-10-19).
const BASE_MODEL = "gpt-6-luna";

describe("GitHub Copilot model picker (HOU-578)", () => {
  it("offers the gpt-6-luna base model — the one option every paid plan serves", () => {
    const models = getProvider("github-copilot")?.models ?? [];
    ok(
      models.some((m) => m.id === BASE_MODEL),
      "github-copilot picker must include the gpt-6-luna base model so every paid plan has a usable option",
    );
  });

  it("defaults Copilot to the base model, not a Pro-only premium one", () => {
    // The default a fresh Copilot connect lands on must work on every plan.
    strictEqual(getDefaultModel("github-copilot"), BASE_MODEL);
  });

  it("resolves the base model to a labelled catalog entry (selectable + named)", () => {
    const model = getModel("github-copilot", BASE_MODEL);
    ok(model, "gpt-6-luna must resolve in the Copilot catalog");
    ok(model?.label, "gpt-6-luna must have a display label for the picker");
  });

  it("is the model the model_unavailable card's 'Switch to gpt-6-luna' fallback points at", () => {
    // The runtime classifier (ai/provider-error.ts COPILOT_BASE_FALLBACK) names
    // gpt-6-luna as the suggested_fallback; that id must be a real picker entry so
    // the card's switch button lands the user on a working model.
    ok(getModel("github-copilot", BASE_MODEL));
  });
});
