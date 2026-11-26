import { canonicalModelId } from "@houston/domain/canonical-model-id";
import { MODEL_ALIASES } from "@houston/domain/model-aliases";
import type { CatalogProvider } from "@houston/protocol";
import { expect, test } from "vitest";
import { withModelAliases } from "./alias-catalog";
import { buildProviderCatalog } from "./pi-catalog";

const catalog = buildProviderCatalog();

function runsAsRows(providerId: string): Record<string, string | undefined> {
  const provider = catalog.find((p) => p.id === providerId);
  return Object.fromEntries(
    (provider?.models ?? [])
      .filter((m) => m.runsAs !== undefined)
      .map((m) => [m.id, m.runsAs]),
  );
}

test("a ceiling naming a row pi 1.6.1 dropped still admits its successor", () => {
  expect(runsAsRows("github-copilot")).toMatchObject({
    "gpt-5.6-terra": "gpt-6.1-terra",
    "claude-opus-5": "claude-opus-5.5",
  });
  expect(runsAsRows("mistral")).toMatchObject({
    "mistral-large-4-0-8": "mistral-large-4",
    "open-mistral-nemo": "ministral-8b-latest",
  });
  expect(runsAsRows("groq")).toEqual({
    "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
  });
  expect(runsAsRows("opencode-go")).toMatchObject({
    "longcat-2.0": "longcat-2.5",
  });
  expect(runsAsRows("opencode-go")["longcat-2.5-free"]).toBeUndefined();
});

test("every alias row names the model a turn on it runs", () => {
  for (const provider of catalog) {
    const ids = new Set(provider.models.map((m) => m.id));
    for (const model of provider.models) {
      if (model.runsAs === undefined || provider.id === "anthropic") continue;
      if (provider.id === "minimax") continue;
      expect(canonicalModelId(provider.id, model.id), model.id).toBe(
        model.runsAs,
      );
      expect(ids.has(model.runsAs), model.runsAs).toBe(true);
    }
  }
});

test("every alias whose successor pi lists has a row", () => {
  for (const [providerId, aliases] of Object.entries(MODEL_ALIASES)) {
    const provider = catalog.find((p) => p.id === providerId);
    if (!provider || !aliases) continue;
    const rows = runsAsRows(providerId);
    for (const stale of Object.keys(aliases)) {
      const target = canonicalModelId(providerId, stale);
      if (!target || target === stale) continue;
      if (!provider.models.some((m) => m.id === target && !m.runsAs)) continue;
      expect(rows[stale], `${providerId}/${stale}`).toBe(target);
    }
  }
});

test("a dropped row is cloned from its successor; a listed one keeps its own data", () => {
  const entry = (id: string, input: number) => ({
    id,
    name: id.toUpperCase(),
    pricing: { input, output: 1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000,
    maxTokens: 100,
    reasoning: false,
    vision: false,
  });
  const provider: CatalogProvider = {
    id: "groq",
    name: "Groq",
    auth: "apiKey",
    models: [entry("openai/gpt-oss-120b", 0.15)],
  };
  expect(withModelAliases(provider).models).toEqual([
    entry("openai/gpt-oss-120b", 0.15),
    {
      ...entry("openai/gpt-oss-120b", 0.15),
      id: "llama-3.3-70b-versatile",
      name: "llama-3.3-70b-versatile",
      runsAs: "openai/gpt-oss-120b",
    },
  ]);
  const listed = {
    ...provider,
    models: [...provider.models, entry("llama-3.3-70b-versatile", 0.59)],
  };
  expect(withModelAliases(listed).models[1]).toEqual({
    ...entry("llama-3.3-70b-versatile", 0.59),
    runsAs: "openai/gpt-oss-120b",
  });
});

test("a provider with no aliases is returned untouched", () => {
  const provider: CatalogProvider = {
    id: "cerebras",
    name: "Cerebras",
    auth: "apiKey",
    models: [],
  };
  expect(withModelAliases(provider)).toBe(provider);
});
