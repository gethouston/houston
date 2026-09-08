import { ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import { DEFAULT_MODEL } from "@houston/sdk/provider-catalog";
import {
  providerErrorModelLabel,
  providerLabel,
  statusPageUrl,
} from "../src/components/shell/provider-error-cards/labels.ts";
import { providerBrandKey } from "../src/components/shell/provider-logo-map.ts";
import { providerModelLabel } from "../src/lib/model-labels.ts";
import {
  PROVIDER_OVERRIDES,
  toCanonicalProviderId,
  toDisplayProviderId,
} from "../src/lib/provider-overrides.ts";
import {
  getDefaultModel,
  getProvider,
  hydrateProviderCatalog,
  PROVIDERS,
  providerName,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

// Labels and defaults come from the hydrated pi catalog, the same source the
// app reads at runtime.
before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

/**
 * The founder's bug: a conversation pinned to pi's canonical `openai-codex`
 * drew the OpenAI mark (the LOGO path aliases the dialect) beside a Claude
 * model id and the raw provider string (the LABEL path did not). Both halves
 * now translate through the same `@houston/domain` dialect map, so no surface
 * can name one provider while drawing another.
 */
describe("the label path aliases the provider dialect, like the icon path", () => {
  it("names the canonical Codex id the way the picker does", () => {
    strictEqual(providerName("openai-codex"), providerName("openai"));
    strictEqual(providerName("openai-codex"), "OpenAI");
  });

  it("finds the catalog entry for a canonical id", () => {
    strictEqual(getProvider("openai-codex")?.id, "openai");
  });

  it("names the pair for a canonical id (routine rows, picker trigger)", () => {
    ok(providerModelLabel("openai-codex", "gpt-6-astra")?.startsWith("OpenAI"));
  });

  it("names the provider on an error card built from a canonical id", () => {
    strictEqual(providerLabel("openai-codex"), "OpenAI");
  });

  it("names the MODEL a card is about instead of echoing its raw id", () => {
    strictEqual(
      providerErrorModelLabel("openai-codex", "gpt-6-astra"),
      "GPT-6 Astra",
    );
    strictEqual(
      providerErrorModelLabel("anthropic", "claude-sonnet-5"),
      "Sonnet 5",
    );
    // An id the catalog has never seen is still the truest name for it.
    strictEqual(providerErrorModelLabel("openai", "gpt-nine"), "gpt-nine");
  });

  it("points Gemini outages at Google's status page (D5: dead branch)", () => {
    strictEqual(statusPageUrl("google"), "https://status.cloud.google.com/");
    strictEqual(statusPageUrl("openai-codex"), "https://status.openai.com/");
    strictEqual(statusPageUrl("gemini"), null);
  });

  it("resolves a label AND a mark for every catalogued provider id", () => {
    for (const provider of PROVIDERS) {
      for (const id of [provider.id, toCanonicalProviderId(provider.id)]) {
        strictEqual(
          providerName(id),
          provider.name,
          `providerName("${id}") leaked a raw id instead of "${provider.name}"`,
        );
        ok(
          providerBrandKey(id) !== null || provider.id === "openai-compatible",
          `no brand mark resolves for "${id}"`,
        );
      }
    }
  });

  it("resolves a label for every provider the domain ships a default for", () => {
    for (const canonical of Object.keys(DEFAULT_MODEL)) {
      const display = toDisplayProviderId(canonical);
      // The fixture catalog is a subset of the real `/v1/catalog`; only the
      // providers it actually hydrates can carry a name here.
      const hydrated = PROVIDERS.find((p) => p.id === display);
      if (!hydrated) continue;
      strictEqual(
        providerName(canonical),
        hydrated.name,
        `providerName("${canonical}") leaked a raw id instead of "${hydrated.name}"`,
      );
    }
  });
});

/**
 * D2: `getDefaultModel` answered a hardcoded `claude-sonnet-4-6` for ANY
 * provider it could not find — so a canonical `openai-codex` (which missed the
 * display-keyed catalog entirely) was handed a Claude model id, and creation
 * flows persisted that pair into `config.json`. A model may never travel from
 * one provider onto another.
 */
describe("getDefaultModel never crosses providers", () => {
  it("answers the Codex default for the canonical Codex id", () => {
    strictEqual(getDefaultModel("openai-codex"), getDefaultModel("openai"));
    strictEqual(getDefaultModel("openai-codex"), "gpt-6-astra");
  });

  it("answers nothing for a provider it does not know", () => {
    strictEqual(getDefaultModel("not-a-provider"), "");
  });
});

/**
 * D3: the Anthropic default read `claude-sonnet-5` in the app catalog and the
 * runtime but `claude-sonnet-4-6` in the domain migration that REWRITES stored
 * configs. One table owns it now.
 */
describe("the app catalog reads its defaults from the domain table", () => {
  it("has no default of its own to drift", () => {
    for (const [id, override] of Object.entries(PROVIDER_OVERRIDES)) {
      ok(
        !("defaultModel" in override),
        `PROVIDER_OVERRIDES["${id}"] restates a default the domain table owns`,
      );
    }
  });

  it("serves the domain default for every seeded provider", () => {
    for (const provider of PROVIDERS) {
      const expected = DEFAULT_MODEL[toCanonicalProviderId(provider.id)];
      if (expected === undefined) continue;
      strictEqual(
        provider.defaultModel,
        expected,
        `${provider.id} defaults to "${provider.defaultModel}", not the domain's "${expected}"`,
      );
    }
  });

  it("keeps Anthropic on the model the runtime and picker agree on", () => {
    strictEqual(DEFAULT_MODEL.anthropic, "claude-sonnet-5");
    strictEqual(getDefaultModel("anthropic"), "claude-sonnet-5");
  });
});
