import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type PinCatalog,
  resolveChatModelPin,
} from "../src/lib/chat-model-pin.ts";

// A tiny stand-in for the hydrated provider catalog, so the precedence is
// testable without loading (or hydrating) the real one. `anthropic` and
// `openai` are catalogued; `kimi-coding` is a provider the catalog does not
// know (a retired card, or any id read before hydration).
const MODELS: Record<string, string[]> = {
  anthropic: ["claude-sonnet-4-6", "claude-sonnet-5", "claude-opus-5"],
  openai: ["gpt-6-astra", "gpt-5.6-sol"],
  gemini: ["gemini-3.8-flash"],
};
const DEFAULTS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-6-astra",
  gemini: "gemini-3.8-flash",
};
const CATALOG: PinCatalog = {
  runs: (provider, model) =>
    MODELS[provider] ? MODELS[provider].includes(model) : true,
  offers: (provider, model) => (MODELS[provider] ?? []).includes(model),
  defaultModel: (provider) => DEFAULTS[provider] ?? "",
};

const NONE = { provider: null, model: null };

describe("resolveChatModelPin", () => {
  it("takes the mission's pinned pair whole", () => {
    deepStrictEqual(
      resolveChatModelPin(
        "openai",
        { provider: "openai", model: "gpt-5.6-sol" },
        { provider: "anthropic", model: "claude-sonnet-4-6" },
        CATALOG,
      ),
      { provider: "openai", model: "gpt-5.6-sol", source: "mission" },
    );
  });

  it("reads a mission pinned in the ENGINE dialect (the logged mismatch)", () => {
    // Activity rows store pi's canonical `openai-codex`; the catalog, picker and
    // logos speak Houston's `openai`. Unmapped, the catalog lookup missed and
    // the model fell through to another provider's default — an OpenAI mark
    // beside `claude-sonnet-4-6`, a pair nothing can run.
    deepStrictEqual(
      resolveChatModelPin(
        "openai-codex",
        { provider: "openai-codex", model: "gpt-5.6-sol" },
        { provider: "anthropic", model: "claude-sonnet-4-6" },
        CATALOG,
      ),
      { provider: "openai", model: "gpt-5.6-sol", source: "mission" },
    );
  });

  it("names the PINNED provider's default when the pin has no model", () => {
    const pin = resolveChatModelPin(
      "openai",
      { provider: "openai", model: null },
      { provider: "anthropic", model: "claude-sonnet-4-6" },
      CATALOG,
    );
    deepStrictEqual(pin, {
      provider: "openai",
      model: "gpt-6-astra",
      source: "deployment",
    });
  });

  it("falls back to the agent's model only on the SAME provider", () => {
    // No downgrade: an Opus agent whose mission pins Anthropic without a model
    // keeps Opus rather than dropping to the provider default.
    deepStrictEqual(
      resolveChatModelPin(
        "anthropic",
        { provider: "anthropic", model: null },
        { provider: "anthropic", model: "claude-opus-5" },
        CATALOG,
      ),
      { provider: "anthropic", model: "claude-opus-5", source: "agent" },
    );
  });

  it("uses the agent's pair when the mission has no pin", () => {
    deepStrictEqual(
      resolveChatModelPin(
        "anthropic",
        NONE,
        { provider: "anthropic", model: "claude-opus-5" },
        CATALOG,
      ),
      { provider: "anthropic", model: "claude-opus-5", source: "agent" },
    );
  });

  it("replaces a retired SKU with the SAME provider's default", () => {
    deepStrictEqual(
      resolveChatModelPin(
        "openai",
        { provider: "openai", model: "gpt-5.5-codex" },
        { provider: "anthropic", model: "claude-opus-5" },
        CATALOG,
      ),
      { provider: "openai", model: "gpt-6-astra", source: "deployment" },
    );
  });

  it("attributes a provider-less stored model by the catalog, never by guess", () => {
    deepStrictEqual(
      resolveChatModelPin(
        "anthropic",
        { provider: null, model: "claude-opus-5" },
        NONE,
        CATALOG,
      ),
      { provider: "anthropic", model: "claude-opus-5", source: "mission" },
    );
    // A stored model the settled provider does not offer belongs to some other
    // provider: it must not travel onto this one.
    deepStrictEqual(
      resolveChatModelPin(
        "anthropic",
        { provider: null, model: "gpt-6-astra" },
        { provider: "anthropic", model: "claude-opus-5" },
        CATALOG,
      ),
      { provider: "anthropic", model: "claude-opus-5", source: "agent" },
    );
  });

  it("never carries a model onto a provider neither source named", () => {
    // The auth fallback (a fresh chat whose preferred provider is signed out)
    // settles on a third provider: the pair comes whole from its own catalog.
    deepStrictEqual(
      resolveChatModelPin(
        "gemini",
        { provider: "openai", model: "gpt-5.6-sol" },
        { provider: "anthropic", model: "claude-opus-5" },
        CATALOG,
      ),
      { provider: "gemini", model: "gemini-3.8-flash", source: "deployment" },
    );
  });

  it("keeps a pinned model on a provider the catalog does not know", () => {
    // Uncatalogued (retired card, or read before the catalog hydrates): the
    // catalog cannot rule the model out, and substituting a hardcoded Anthropic
    // id — what the old chain did — names a model this provider never runs.
    const pin = resolveChatModelPin(
      "kimi-coding",
      { provider: "kimi-coding", model: "kimi-k3" },
      { provider: "anthropic", model: "claude-sonnet-4-6" },
      CATALOG,
    );
    deepStrictEqual(pin, {
      provider: "kimi-coding",
      model: "kimi-k3",
      source: "mission",
    });
  });

  it("names no model at all rather than one from another provider", () => {
    const pin = resolveChatModelPin(
      "kimi-coding",
      { provider: "kimi-coding", model: null },
      { provider: "anthropic", model: "claude-sonnet-4-6" },
      CATALOG,
    );
    strictEqual(pin.model, "");
  });
});
