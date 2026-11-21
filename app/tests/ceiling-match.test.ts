import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { CatalogModelEntry, ProviderCatalog } from "@houston/protocol";
import {
  clampPickerToCeiling,
  hiddenModelCount,
  isModelAllowed,
  type RunsAsLookup,
  runnableEntry,
} from "../src/lib/ceiling-match.ts";
import { encodeModelPickerId } from "../src/lib/chat-model-picker-ids.ts";
import {
  catalogRunsAs,
  getModel,
  hydrateProviderCatalog,
} from "../src/lib/providers.ts";

const none: RunsAsLookup = () => null;
const lineup: RunsAsLookup = (provider, model) =>
  provider === "anthropic" && model === "claude-opus-5"
    ? "claude-opus-5-5"
    : null;
const retiredOpus = ["anthropic/claude-opus-5", "claude-opus-5"];

describe("isModelAllowed", () => {
  it("treats null / undefined ceiling as no ceiling (all models allowed)", () => {
    strictEqual(isModelAllowed(null, "openai", "gpt-6-astra", none), true);
    strictEqual(isModelAllowed(undefined, "openai", "gpt-6-astra", none), true);
  });

  it("gates on case-insensitive membership when a ceiling is set", () => {
    strictEqual(
      isModelAllowed(["gpt-6-astra", "claude"], "openai", "GPT-6-Astra", none),
      true,
    );
    strictEqual(
      isModelAllowed(["gpt-6-astra"], "anthropic", "claude", none),
      false,
    );
    strictEqual(isModelAllowed([], "openai", "gpt-6-astra", none), false);
  });

  it("admits a retired entry's runsAs model on its own provider only", () => {
    strictEqual(
      isModelAllowed(retiredOpus, "anthropic", "claude-opus-5-5", lineup),
      true,
    );
    strictEqual(
      isModelAllowed(retiredOpus, "opencode", "claude-opus-5-5", lineup),
      false,
    );
    strictEqual(
      isModelAllowed(retiredOpus, "anthropic", "claude-sonnet-5-5", lineup),
      false,
    );
    strictEqual(
      isModelAllowed([], "anthropic", "claude-opus-5-5", lineup),
      false,
    );
  });
});

describe("runnableEntry", () => {
  const offers = (provider: string, model: string) =>
    provider === "opencode" && model === "claude-opus-5";
  it("prefers the provider's runsAs, then its own offer", () => {
    strictEqual(
      runnableEntry("anthropic", "claude-opus-5", offers, lineup),
      "claude-opus-5-5",
    );
    strictEqual(
      runnableEntry("opencode", "claude-opus-5", offers, lineup),
      "claude-opus-5",
    );
    strictEqual(
      runnableEntry("openrouter", "claude-opus-5", offers, lineup),
      null,
    );
  });
});

const row = (provider: string, model: string) => ({
  id: encodeModelPickerId(provider, model),
  providerId: provider,
});

describe("clampPickerToCeiling", () => {
  const models = [
    row("anthropic", "claude-opus-5-5"),
    row("anthropic", "claude-sonnet-5-5"),
    row("opencode", "claude-opus-5-5"),
    row("openrouter", "anthropic/claude-opus-5"),
  ];
  const providers = [
    { id: "anthropic" },
    { id: "opencode" },
    { id: "openrouter" },
  ];

  it("keeps the anthropic lineup row a retired ceiling runs as", () => {
    const clamped = clampPickerToCeiling(
      models,
      providers,
      retiredOpus,
      lineup,
    );
    deepStrictEqual(
      clamped.models.map((m) => m.id),
      ["anthropic::claude-opus-5-5", "openrouter::anthropic/claude-opus-5"],
    );
    deepStrictEqual(
      clamped.providers.map((p) => p.id),
      ["anthropic", "openrouter"],
    );
  });

  it("returns both lists untouched without a ceiling", () => {
    const clamped = clampPickerToCeiling(models, providers, null, lineup);
    strictEqual(clamped.models, models);
    strictEqual(clamped.providers, providers);
  });
});

describe("hiddenModelCount", () => {
  const universe = [
    row("anthropic", "claude"),
    row("openai", "gpt-6-astra"),
    row("google", "gemini"),
  ];

  it("hides nothing when there is no ceiling or it allows every model", () => {
    strictEqual(hiddenModelCount(universe, null, none), 0);
    strictEqual(
      hiddenModelCount(universe, ["claude", "gpt-6-astra", "gemini"], none),
      0,
    );
  });

  it("counts exactly the models the ceiling turns off, once per model", () => {
    strictEqual(hiddenModelCount(universe, ["claude"], none), 2);
    const dupes = [
      row("openrouter", "gpt-6-astra"),
      row("openai", "gpt-6-astra"),
      row("anthropic", "claude"),
    ];
    strictEqual(hiddenModelCount(dupes, ["claude"], none), 1);
    strictEqual(hiddenModelCount([], ["claude"], none), 0);
  });

  it("does not count a model the ceiling keeps on one of its providers", () => {
    const rows = [
      row("anthropic", "claude-opus-5-5"),
      row("opencode", "claude-opus-5-5"),
      row("anthropic", "claude-sonnet-5-5"),
    ];
    strictEqual(hiddenModelCount(rows, retiredOpus, lineup), 1);
  });
});

function entry(id: string, runsAs?: string): CatalogModelEntry {
  return {
    id,
    name: id,
    pricing: { input: 1, output: 1 },
    contextWindow: 200_000,
    maxTokens: 8_192,
    reasoning: false,
    vision: false,
    ...(runsAs ? { runsAs } : {}),
  };
}

describe("catalogRunsAs", () => {
  const catalog: ProviderCatalog = [
    {
      id: "anthropic",
      name: "Anthropic",
      auth: "oauth",
      models: [
        entry("claude-opus-5", "claude-opus-5-5"),
        entry("claude-opus-5-5"),
      ],
    },
    {
      id: "opencode",
      name: "OpenCode",
      auth: "apiKey",
      models: [entry("claude-opus-5")],
    },
  ];

  it("reads runsAs off rows the picker hides, per provider", () => {
    hydrateProviderCatalog(catalog);
    strictEqual(getModel("anthropic", "claude-opus-5"), undefined);
    strictEqual(catalogRunsAs("anthropic", "claude-opus-5"), "claude-opus-5-5");
    strictEqual(catalogRunsAs("anthropic", "Claude-Opus-5"), "claude-opus-5-5");
    strictEqual(catalogRunsAs("anthropic", "claude-opus-5-5"), null);
    strictEqual(catalogRunsAs("opencode", "claude-opus-5"), null);
  });

  it("rebuilds on every hydration", () => {
    hydrateProviderCatalog([{ ...catalog[1] } as ProviderCatalog[number]]);
    strictEqual(catalogRunsAs("anthropic", "claude-opus-5"), null);
  });
});
