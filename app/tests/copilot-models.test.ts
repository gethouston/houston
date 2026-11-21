import { ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import {
  getDefaultModel,
  getModel,
  getProvider,
  hydrateProviderCatalog,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

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
    strictEqual(getDefaultModel("github-copilot"), BASE_MODEL);
  });

  it("resolves the base model to a labelled catalog entry (selectable + named)", () => {
    const model = getModel("github-copilot", BASE_MODEL);
    ok(model, "gpt-6-luna must resolve in the Copilot catalog");
    ok(model?.label, "gpt-6-luna must have a display label for the picker");
  });

  it("is the model the model_unavailable card's 'Switch to gpt-6-luna' fallback points at", () => {
    ok(getModel("github-copilot", BASE_MODEL));
  });
});
