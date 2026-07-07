import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ProviderCatalog } from "@houston/protocol";
import { modelCatalog } from "../src/components/tabs/agent-admin/agent-admin-models-catalog.ts";
import {
  ceilingMode,
  ceilingValue,
} from "../src/components/tabs/agent-admin/agent-admin-row-values.ts";
import { hydrateProviderCatalog } from "../src/lib/providers.ts";

// The model catalog is runtime-hydrated from the host's GET /v1/catalog (#701):
// `PROVIDERS` seeds with empty model lists, so `modelCatalog()` is empty until
// `hydrateProviderCatalog` runs. Feed a minimal catalog matching the real
// payload shape (`ProviderCatalog`) so the picker source has models to expose.
const CATALOG_FIXTURE: ProviderCatalog = [
  {
    id: "anthropic",
    name: "Anthropic",
    auth: "oauth",
    models: [
      {
        id: "claude-opus-4-8",
        name: "Claude Opus 4.8",
        pricing: { input: 15, output: 75 },
        contextWindow: 200_000,
        maxTokens: 64_000,
        reasoning: true,
        vision: true,
        thinkingLevels: ["low", "medium", "high"],
      },
      {
        id: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        pricing: { input: 3, output: 15 },
        contextWindow: 200_000,
        maxTokens: 64_000,
        reasoning: true,
        vision: true,
        thinkingLevels: ["low", "medium", "high"],
      },
    ],
  },
];

hydrateProviderCatalog(CATALOG_FIXTURE);

describe("ceilingValue — inline row state for a ceiling", () => {
  it("undefined (loading / non-Teams host) yields null → show no value yet", () => {
    strictEqual(ceilingValue(undefined), null);
  });

  it("null ceiling means everything is allowed", () => {
    deepStrictEqual(ceilingValue(null), { kind: "all" });
  });

  it("an explicit set reports its count (including empty = 0)", () => {
    deepStrictEqual(ceilingValue([]), { kind: "count", count: 0 });
    deepStrictEqual(ceilingValue(["gpt-5.5", "claude-opus-4-8"]), {
      kind: "count",
      count: 2,
    });
  });
});

describe("ceilingMode — the always-visible two-option choice", () => {
  it("a null ceiling maps to the 'any' (allow-all) option", () => {
    strictEqual(ceilingMode(null), "any");
  });

  it("any explicit set (including empty) maps to the 'picked' option", () => {
    strictEqual(ceilingMode([]), "picked");
    strictEqual(ceilingMode(["claude-opus-4-8"]), "picked");
  });
});

describe("modelCatalog — the allowed-models picker source", () => {
  const catalog = modelCatalog();

  it("is non-empty and deduped by model id", () => {
    ok(catalog.length > 0);
    const ids = catalog.map((m) => m.id);
    strictEqual(new Set(ids).size, ids.length);
  });

  it("is sorted A-Z by label (then id) for a stable picker order", () => {
    for (let i = 1; i < catalog.length; i++) {
      const prev = catalog[i - 1];
      const cur = catalog[i];
      ok(
        prev.label.localeCompare(cur.label) < 0 ||
          (prev.label === cur.label && prev.id.localeCompare(cur.id) <= 0),
      );
    }
  });

  it("every entry carries a human label", () => {
    for (const entry of catalog) {
      ok(entry.id.length > 0);
      ok(entry.label.length > 0);
    }
  });
});
