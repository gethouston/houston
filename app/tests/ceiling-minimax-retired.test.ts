import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ProviderCatalog } from "@houston/protocol";
import { piCatalogToCandidates } from "../src/lib/ai-hub/catalog-pi.ts";
import { isModelAllowed } from "../src/lib/ceiling-match.ts";
import { isModelVisible } from "../src/lib/provider-overrides.ts";
import { buildProvider } from "../src/lib/providers/build-provider.ts";
import { catalogRunsAs, indexRunsAs } from "../src/lib/providers/runs-as.ts";

/**
 * A team ceiling written before MiniMax moved to M3.1 Flash names a retired id
 * (`MiniMax-M3[1m]`, `MiniMax-M2.7`). The host keeps each as a hidden row whose
 * `runsAs` is M3.1 Flash, so the ceiling still admits MiniMax in the picker.
 * A ceiling naming a row pi dropped gets the same from the domain's alias
 * table: its row runs as the successor and no picker offers the old id.
 * Reads the catalog the host actually serves.
 */
const { buildProviderCatalog } = (await import(
  new URL("../../packages/host/src/providers/pi-catalog.ts", import.meta.url)
    .href
)) as { buildProviderCatalog(): ProviderCatalog };

const catalog = buildProviderCatalog();
indexRunsAs(catalog);

describe("a ceiling naming a retired MiniMax id", () => {
  for (const retired of [
    "MiniMax-M3[1m]",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
  ]) {
    it(`${retired} admits M3.1 Flash on minimax`, () => {
      ok(
        isModelAllowed(
          [retired],
          "minimax",
          "MiniMax-M3.1-Flash",
          catalogRunsAs,
        ),
      );
    });
    it(`${retired} stays out of the picker`, () => {
      ok(!isModelVisible("minimax", retired));
    });
  }
});

describe("a ceiling naming a row pi 1.6.1 dropped", () => {
  for (const [provider, stale, successor] of [
    ["github-copilot", "gpt-5.6-terra", "gpt-6.1-terra"],
    ["github-copilot", "claude-opus-5", "claude-opus-5.5"],
    ["mistral", "mistral-large-4-0-8", "mistral-large-4"],
    ["groq", "llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
    ["opencode-go", "longcat-2.0", "longcat-2.5"],
  ] as const) {
    it(`${provider}/${stale} admits ${successor}`, () => {
      ok(isModelAllowed([stale], provider, successor, catalogRunsAs));
    });
    it(`${provider}/${stale} stays out of the picker and the hub`, () => {
      const piProvider = catalog.find((p) => p.id === provider);
      if (!piProvider) throw new Error(`${provider} is not in the catalog`);
      ok(piProvider.models.some((m) => m.id === stale));
      const picker = buildProvider(piProvider, provider, undefined);
      ok(!picker.models.some((m) => m.id === stale));
      ok(picker.models.some((m) => m.id === successor));
      ok(
        !piCatalogToCandidates(catalog).some(
          (c) => c.providerId === provider && c.raw.id === stale,
        ),
      );
    });
  }

  it("a free pin's ceiling does not admit the paid LongCat 2.5", () => {
    strictEqual(catalogRunsAs("opencode-go", "longcat-2.5-free"), null);
  });
});
