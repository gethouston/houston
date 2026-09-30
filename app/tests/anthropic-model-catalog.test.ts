import { deepStrictEqual, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { CatalogModelEntry, ProviderCatalog } from "@houston/protocol";
import { ANTHROPIC_LINEUP } from "@houston/sdk/provider-catalog";
import { buildPickerModels } from "../src/lib/chat-model-picker-map.ts";
import { VISIBLE_MODELS } from "../src/lib/provider-overrides/pi-catalog-filters.ts";
import { PROVIDER_OVERRIDES } from "../src/lib/provider-overrides.ts";
import {
  getContextWindowConfig,
  getEffortLevels,
  getModel,
  getProvider,
  getVisibleProviders,
  hydrateProviderCatalog,
  normalizeLegacyModel,
  validModelOrNull,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

// The Anthropic card offers exactly the Claude lineup: Sonnet 5.5 (the
// default, first), Opus 5.5, Fable 5.1. Its models come from pi (windows +
// effort) + the Houston override (labels, order); these lock in the hydrated
// result the picker reads.

const LINEUP = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"];

describe("the app's Anthropic curation is the domain's Claude lineup", () => {
  it("shows exactly the lineup, and orders it as the lineup does", () => {
    deepStrictEqual(Object.values(ANTHROPIC_LINEUP), LINEUP);
    deepStrictEqual(
      [...(VISIBLE_MODELS.anthropic ?? [])].sort(),
      [...LINEUP].sort(),
    );
    deepStrictEqual(
      Object.keys(PROVIDER_OVERRIDES.anthropic?.models ?? {}),
      LINEUP,
    );
  });
});

/** The Anthropic picker rows, in the order the picker renders them. */
function anthropicPickerRows(): { id: string; name: string }[] {
  return buildPickerModels({
    visibleProviders: getVisibleProviders({ newEngine: true, desktop: true }),
    statuses: {},
  })
    .filter((row) => row.providerId === "anthropic")
    .map((row) => ({ id: row.id, name: row.name }));
}

const PICKER_LINEUP = [
  { id: "anthropic::claude-sonnet-5-5", name: "Sonnet 5.5" },
  { id: "anthropic::claude-opus-5-5", name: "Opus 5.5" },
  { id: "anthropic::claude-fable-5-1", name: "Fable 5.1" },
];

describe("the Anthropic picker offers exactly the Claude lineup", () => {
  before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

  it("lists Sonnet 5.5, Opus 5.5, Fable 5.1, in that order", () => {
    deepStrictEqual(anthropicPickerRows(), PICKER_LINEUP);
  });

  it("pre-selects Sonnet 5.5", () => {
    strictEqual(getProvider("anthropic")?.defaultModel, "claude-sonnet-5-5");
  });

  it("runs every lineup model at pi's flat 1M window", () => {
    for (const id of LINEUP)
      deepStrictEqual(getContextWindowConfig("anthropic", id), {
        default: 1_000_000,
        max: 1_000_000,
      });
  });

  it("derives Fable 5.1's effort straight from pi (low→xhigh)", () => {
    deepStrictEqual(getEffortLevels("anthropic", "claude-fable-5-1"), [
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });
});

describe("a stored retired Claude id reads as its family's lineup model", () => {
  before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

  it("is no longer a row of its own", () => {
    for (const id of ["claude-opus-5", "claude-opus-4-8", "claude-sonnet-4-6"])
      strictEqual(getModel("anthropic", id), undefined, id);
  });

  it("lands in its own family, never another (no Opus→Sonnet downgrade)", () => {
    const cases: Record<string, string> = {
      "claude-opus-5": "claude-opus-5-5",
      "claude-opus-4-8": "claude-opus-5-5",
      "claude-sonnet-5": "claude-sonnet-5-5",
      "claude-sonnet-4-6": "claude-sonnet-5-5",
      "claude-fable-5": "claude-fable-5-1",
    };
    for (const [stored, lineup] of Object.entries(cases))
      strictEqual(
        validModelOrNull(
          "anthropic",
          normalizeLegacyModel(stored, "anthropic"),
        ),
        lineup,
        stored,
      );
  });
});

/**
 * pi 0.99.1's real `anthropic` catalog: every row, in pi's order, under pi's
 * own display names ("(latest)" suffixes included, which fold to the same
 * cross-provider key as their dated twins). The picker was reported missing
 * Sonnet 5.5 against a catalog that served it; this proves the data path keeps
 * it, first, against the catalog exactly as the host serves it.
 */
const PI_ANTHROPIC: [string, string][] = [
  ["claude-fable-5", "Claude Fable 5"],
  ["claude-fable-5-1", "Claude Fable 5.1"],
  ["claude-haiku-4-5", "Claude Haiku 4.5 (latest)"],
  ["claude-haiku-4-5-20251001", "Claude Haiku 4.5"],
  ["claude-opus-4-5", "Claude Opus 4.5 (latest)"],
  ["claude-opus-4-5-20251101", "Claude Opus 4.5"],
  ["claude-opus-4-6", "Claude Opus 4.6"],
  ["claude-opus-4-7", "Claude Opus 4.7"],
  ["claude-opus-4-8", "Claude Opus 4.8"],
  ["claude-opus-5", "Claude Opus 5"],
  ["claude-opus-5-5", "Claude Opus 5.5"],
  ["claude-sonnet-4-5", "Claude Sonnet 4.5 (latest)"],
  ["claude-sonnet-4-5-20250929", "Claude Sonnet 4.5"],
  ["claude-sonnet-4-6", "Claude Sonnet 4.6"],
  ["claude-sonnet-5", "Claude Sonnet 5"],
  ["claude-sonnet-5-5", "Claude Sonnet 5.5"],
];

function liveAnthropicCatalog(): ProviderCatalog {
  const models: CatalogModelEntry[] = PI_ANTHROPIC.map(([id, name]) => ({
    id,
    name,
    pricing: { input: 1, output: 2 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    reasoning: true,
    vision: true,
    thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh"],
  }));
  return [{ id: "anthropic", name: "Anthropic", auth: "oauth", models }];
}

describe("the Anthropic picker against pi's live catalog", () => {
  before(() => hydrateProviderCatalog(liveAnthropicCatalog()));

  it("keeps Sonnet 5.5 as the first of exactly three rows", () => {
    deepStrictEqual(anthropicPickerRows(), PICKER_LINEUP);
  });
});
