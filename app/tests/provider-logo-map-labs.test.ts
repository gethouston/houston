/**
 * Every AI-hub lab id must resolve through the ONE brand registry
 * (`providerBrandKey`) to either a real models.dev brand mark or, deliberately,
 * the monogram fallback — the model ledger, modal, and offer rows all draw the
 * lab mark via `ProviderGlyph`, which pairs this resolver with `<Monogram>`.
 *
 * The map below is exhaustive by `Record<LabId, …>`: adding a lab id to the
 * union fails the typecheck here until its expected mark (or `null` monogram) is
 * declared, so a new lab can never silently borrow the wrong logo.
 */

import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { BrandKey } from "../src/components/shell/provider-logo-map.ts";
import { providerBrandKey } from "../src/components/shell/provider-logo-map.ts";
import type { LabId } from "../src/lib/ai-hub/catalog-types.ts";

// `null` = no shipped mark, resolves to the monogram (same as the provider list).
const EXPECTED: Record<LabId, BrandKey | null> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  meta: null,
  mistral: "mistral",
  qwen: null,
  deepseek: "deepseek",
  xai: "xai",
  amazon: "amazon-bedrock",
  minimax: "minimax",
  zai: "zai",
  moonshot: "moonshotai",
  cohere: null,
  nvidia: "nvidia",
  other: null,
};

describe("lab id -> brand mark resolution", () => {
  for (const [lab, brand] of Object.entries(EXPECTED) as [
    LabId,
    BrandKey | null,
  ][]) {
    it(`resolves lab "${lab}" to ${brand ?? "the monogram"}`, () => {
      strictEqual(providerBrandKey(lab), brand);
    });
  }

  it("aliases the moonshot lab id onto the moonshotai brand mark", () => {
    strictEqual(providerBrandKey("moonshot"), "moonshotai");
  });
});
