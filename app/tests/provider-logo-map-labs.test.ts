import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { BrandKey } from "../src/components/shell/provider-logo-map.ts";
import { providerBrandKey } from "../src/components/shell/provider-logo-map.ts";
import type { LabId } from "../src/lib/ai-hub/catalog-types.ts";

const EXPECTED: Record<LabId, BrandKey | null> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  meta: "meta",
  mistral: "mistral",
  qwen: "qwen",
  deepseek: "deepseek",
  xai: "xai",
  amazon: "amazon-bedrock",
  minimax: "minimax",
  zai: "zai",
  moonshot: "moonshotai",
  cohere: "cohere",
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
