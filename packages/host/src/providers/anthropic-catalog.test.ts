import { modelAliasesFor } from "@houston/domain/model-aliases";
import type { CatalogModelEntry, CatalogProvider } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  ANTHROPIC_PROVIDER_ID,
  withAnthropicLineup,
} from "./anthropic-catalog";
import { buildProviderCatalog } from "./pi-catalog";

function row(id: string): CatalogModelEntry {
  return {
    id,
    name: id,
    pricing: { input: 1, output: 1 },
    contextWindow: 200_000,
    maxTokens: 8_192,
    reasoning: true,
    vision: true,
  };
}

const anthropic = (ids: string[]): CatalogProvider => ({
  id: ANTHROPIC_PROVIDER_ID,
  name: "Anthropic",
  auth: "oauth",
  models: ids.map(row),
});

test("retired Claude rows run as their own family's lineup model", () => {
  const shaped = withAnthropicLineup(
    anthropic([
      "claude-opus-5",
      "claude-opus-4-1-20250805",
      "claude-sonnet-4-5-20250929",
      "claude-fable-5",
      "claude-opus-5-5",
    ]),
  );
  expect(shaped.models.map((m) => [m.id, m.runsAs])).toEqual([
    ["claude-opus-5", "claude-opus-5-5"],
    ["claude-opus-4-1-20250805", "claude-opus-5-5"],
    ["claude-sonnet-4-5-20250929", "claude-sonnet-5-5"],
    ["claude-fable-5", "claude-fable-5-2"],
    ["claude-opus-5-5", undefined],
  ]);
});

test("lineup rows carry no runsAs and a row outside every family is dropped", () => {
  const shaped = withAnthropicLineup(
    anthropic([
      "claude-haiku-4-5",
      "claude-sonnet-5-5",
      "claude-2.1",
      "claude-haiku-5-5",
      "claude-fable-5-2",
    ]),
  );
  expect(shaped.models.map((m) => [m.id, m.runsAs])).toEqual([
    ["claude-haiku-4-5", "claude-haiku-5-5"],
    ["claude-sonnet-5-5", undefined],
    ["claude-haiku-5-5", undefined],
    ["claude-fable-5-2", undefined],
  ]);
});

test("GET /v1/catalog shapes anthropic's rows and no other provider's Claude rows", () => {
  const catalog = buildProviderCatalog();
  const claude = catalog.find((p) => p.id === ANTHROPIC_PROVIDER_ID);
  expect(claude).toBeDefined();
  const byId = new Map(claude?.models.map((m) => [m.id, m]));
  expect(byId.get("claude-opus-5")?.runsAs).toBe("claude-opus-5-5");
  expect(byId.get("claude-opus-5-5")?.runsAs).toBeUndefined();
  expect(byId.get("claude-haiku-4-5")?.runsAs).toBe("claude-haiku-5-5");
  expect(byId.get("claude-haiku-5-5")?.runsAs).toBeUndefined();
  // MiniMax's retired rows carry `runsAs` too (./pi-catalog.test.ts), and so
  // does every other provider's renamed id (./alias-catalog.test.ts), but
  // never by the Claude lineup rule.
  for (const provider of catalog) {
    if (provider.id === ANTHROPIC_PROVIDER_ID || provider.id === "minimax")
      continue;
    const aliases = modelAliasesFor(provider.id);
    for (const m of provider.models)
      if (m.runsAs !== undefined)
        expect(Object.hasOwn(aliases, m.id), `${provider.id}/${m.id}`).toBe(
          true,
        );
  }
  // Other providers keep their own Claude Haiku rows, unmapped.
  expect(
    catalog.some(
      (p) =>
        p.id !== ANTHROPIC_PROVIDER_ID &&
        p.models.some((m) => m.id.includes("haiku")),
    ),
  ).toBe(true);
});
