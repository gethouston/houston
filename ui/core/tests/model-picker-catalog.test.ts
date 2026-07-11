import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  connectedProviderIds,
  connectedProviders,
  modelsForProvider,
  providerListLoading,
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

  it("modelsForProvider returns a connected provider's models in input order", () => {
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
