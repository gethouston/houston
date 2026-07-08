import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  connectedProviderIds,
  connectedProviders,
  modelsForProvider,
  providerListLoading,
  searchModels,
} from "../src/components/model-picker/catalog.ts";
import type {
  ModelPickerModel,
  ModelPickerProvider,
} from "../src/components/model-picker/types.ts";

const provider = (
  id: string,
  connection: ModelPickerProvider["connection"],
): ModelPickerProvider => ({ id, name: id.toUpperCase(), connection });

const model = (
  id: string,
  providerId: string,
  name: string,
  description?: string,
): ModelPickerModel => ({ id, providerId, name, description });

const PROVIDERS: ModelPickerProvider[] = [
  provider("anthropic", "connected"),
  provider("openai", "connected"),
  provider("google", "disconnected"),
];

const MODELS: ModelPickerModel[] = [
  model("anthropic::opus", "anthropic", "Claude Opus"),
  model("anthropic::sonnet", "anthropic", "Claude Sonnet"),
  model("openai::gpt5", "openai", "GPT-5"),
  model("google::gemini", "google", "Gemini Pro"),
];

describe("connected-only selection", () => {
  it("connectedProviders keeps only connected, in order", () => {
    assert.deepEqual(
      connectedProviders(PROVIDERS).map((p) => p.id),
      ["anthropic", "openai"],
    );
  });

  it("connectedProviderIds excludes disconnected + checking", () => {
    const ids = connectedProviderIds([
      provider("a", "connected"),
      provider("b", "checking"),
      provider("c", "disconnected"),
    ]);
    assert.deepEqual([...ids], ["a"]);
  });

  it("modelsForProvider returns a connected provider's models", () => {
    const ids = connectedProviderIds(PROVIDERS);
    assert.deepEqual(
      modelsForProvider(MODELS, ids, "anthropic").map((m) => m.id),
      ["anthropic::opus", "anthropic::sonnet"],
    );
  });

  it("modelsForProvider returns nothing for a disconnected provider", () => {
    const ids = connectedProviderIds(PROVIDERS);
    assert.deepEqual(modelsForProvider(MODELS, ids, "google"), []);
  });
});

describe("providerListLoading (#342 flicker guard)", () => {
  it("is loading while statuses are still checking and nothing is connected", () => {
    assert.equal(
      providerListLoading([provider("a", "checking")], "ready"),
      true,
    );
  });

  it("is loading while the catalog is loading and nothing is connected", () => {
    assert.equal(providerListLoading([], "loading"), true);
  });

  it("is not loading once a provider is connected", () => {
    assert.equal(
      providerListLoading(
        [provider("a", "connected"), provider("b", "checking")],
        "loading",
      ),
      false,
    );
  });

  it("is not loading when settled with zero connected (genuine empty)", () => {
    assert.equal(
      providerListLoading([provider("a", "disconnected")], "ready"),
      false,
    );
  });
});

describe("searchModels (flat ranked, connected-only)", () => {
  it("flattens across connected providers and excludes disconnected ones", () => {
    const hits = searchModels(MODELS, PROVIDERS, "e");
    // "Gemini Pro" is under a disconnected provider → excluded, even though it
    // would match.
    assert.equal(
      hits.some((m) => m.providerId === "google"),
      false,
    );
  });

  it("ranks name-start matches ahead of later / other-field matches", () => {
    const models: ModelPickerModel[] = [
      model("p::a", "p", "Zeta model", "gpt inside description"),
      model("p::b", "p", "GPT mini"),
      model("p::c", "p", "The GPT one"),
    ];
    const provs = [provider("p", "connected")];
    const hits = searchModels(models, provs, "gpt");
    assert.deepEqual(
      hits.map((m) => m.id),
      // name-start "GPT mini" (0), then name-substring "The GPT one" (4),
      // then description-only "Zeta model" (last).
      ["p::b", "p::c", "p::a"],
    );
  });

  it("matches provider name and id via the haystack", () => {
    const hits = searchModels(MODELS, PROVIDERS, "openai");
    assert.deepEqual(
      hits.map((m) => m.id),
      ["openai::gpt5"],
    );
  });

  it("returns nothing for a blank query", () => {
    assert.deepEqual(searchModels(MODELS, PROVIDERS, "   "), []);
  });

  it("curated beats uncurated within the name-match tier, regardless of position", () => {
    const provs = [provider("p", "connected")];
    const models: ModelPickerModel[] = [
      // Legacy model matches at name START (pos 0) but is uncurated…
      model("p::legacy", "p", "Opus 3 (legacy)"),
      // …while the curated flagship matches later in its name (pos 7).
      { ...model("p::flagship", "p", "Claude Opus 4.8"), curated: true },
    ];
    assert.deepEqual(
      searchModels(models, provs, "opus").map((m) => m.id),
      ["p::flagship", "p::legacy"],
    );
  });

  it("within curated, an equal-position tie keeps input (curation) order", () => {
    const provs = [provider("p", "connected")];
    const models: ModelPickerModel[] = [
      { ...model("p::opus48", "p", "Claude Opus 4.8"), curated: true },
      { ...model("p::opus47", "p", "Claude Opus 4.7"), curated: true },
      model("p::opus3", "p", "Claude Opus 3"),
    ];
    assert.deepEqual(
      searchModels(models, provs, "opus").map((m) => m.id),
      ["p::opus48", "p::opus47", "p::opus3"],
    );
  });

  it("a legacy NAME match still beats a curated other-field-only match", () => {
    const provs = [provider("p", "connected")];
    const models: ModelPickerModel[] = [
      {
        ...model("p::flagship", "p", "Claude Opus 4.8", "great at gpt tasks"),
        curated: true,
      },
      model("p::legacy", "p", "GPT-4 Turbo"),
    ];
    // Match tier stays primary: the name match wins even though it is legacy.
    assert.deepEqual(
      searchModels(models, provs, "gpt").map((m) => m.id),
      ["p::legacy", "p::flagship"],
    );
  });
});
