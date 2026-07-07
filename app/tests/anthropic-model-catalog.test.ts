import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import {
  getContextWindowConfig,
  getEffortLevels,
  getModel,
  hydrateProviderCatalog,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

// Regression guards for the Anthropic window sizing plus the Fable 5 picker
// restore. Anthropic's models now come from pi (windows + effort) + the Houston
// override (labels, snap-up ceiling); the sample catalog carries pi's windows,
// so these lock in the hydrated result the picker reads. `claude-sonnet-5` is
// intentionally NOT asserted: pi-ai 0.79.10 ships no such id, its curated
// override was orphaned and removed, and the drift guard
// (provider-overrides-drift.test.ts) now rejects any override id pi lacks.
before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

describe("Sonnet 4.6 still credit-gates its 1M window", () => {
  it("starts at 200k and snaps up to 1M (unchanged by HOU-618)", () => {
    deepStrictEqual(getContextWindowConfig("anthropic", "claude-sonnet-4-6"), {
      default: 200_000,
      max: 1_000_000,
    });
  });
});

describe("Fable 5 restored to the picker", () => {
  it("is present as the flagship model", () => {
    const fable = getModel("anthropic", "claude-fable-5");
    ok(fable, "claude-fable-5 should be in the Anthropic catalog");
    strictEqual(fable?.label, "Fable 5");
  });

  it("has a flat 1M context window like Opus 4.8", () => {
    deepStrictEqual(getContextWindowConfig("anthropic", "claude-fable-5"), {
      default: 1_000_000,
      max: 1_000_000,
    });
  });

  it("derives its effort straight from pi (low→xhigh, no retired max)", () => {
    deepStrictEqual(getEffortLevels("anthropic", "claude-fable-5"), [
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });
});
