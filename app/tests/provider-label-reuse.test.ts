import { ok, strictEqual } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { PROVIDER_DISPLAY_RENAME } from "@houston/sdk/provider-catalog";
import { providerLabel } from "../src/components/shell/provider-error-cards/labels.ts";
import { providerBrandKey } from "../src/components/shell/provider-logo-map.ts";
import { hydrateProviderCatalog, providerName } from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

/**
 * B12 — naming a provider is ONE helper (`providerName`). Surfaces that inlined
 * `getProvider(id)?.name ?? id` had a second copy of the fallback chain, which
 * is exactly how the label path and the icon path drifted apart before.
 */
describe("provider naming has one helper", () => {
  it("the error cards' label IS the shared helper, not a copy of it", () => {
    strictEqual(providerLabel, providerName);
  });

  it("names a provider in either dialect", () => {
    strictEqual(providerLabel("openai-codex"), "OpenAI");
    strictEqual(providerLabel("openai"), "OpenAI");
    // An id the catalog has never seen is still the truest name we can print.
    strictEqual(providerLabel("not-a-provider"), "not-a-provider");
  });

  it("the compaction divider names the provider through the helper", () => {
    // A .tsx surface can't be mounted under the app's strip-types runner, so
    // the guard is on the shape: no second copy of the fallback chain.
    const src = read("../src/components/context-compacted-divider.tsx");
    ok(
      !src.includes("getProvider("),
      "the divider must not restate the name-with-fallback chain",
    );
    ok(
      src.includes("providerName("),
      "the divider must call the shared helper",
    );
  });
});

/**
 * B11 — the logo table restated the `openai-codex → openai` dialect pair. It
 * reads the ONE table that owns it, so a rename added there lights up the mark
 * without a second edit here.
 */
describe("brand aliases follow the provider dialect", () => {
  it("draws one mark for both spellings of a renamed provider", () => {
    for (const [canonical, display] of Object.entries(
      PROVIDER_DISPLAY_RENAME,
    )) {
      strictEqual(
        providerBrandKey(canonical),
        providerBrandKey(display),
        `${canonical} and ${display} are one brand and must draw one mark`,
      );
    }
  });

  it("resolves the dialect pair Houston ships today", () => {
    strictEqual(providerBrandKey("openai-codex"), "openai");
  });

  it("does not restate the dialect pair", () => {
    const src = read("../src/components/shell/provider-logo-map.ts");
    ok(
      !src.includes('"openai-codex": "openai"'),
      "the dialect pair must come from @houston/domain, not a second copy",
    );
  });
});
