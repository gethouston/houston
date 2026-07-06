import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  CatalogModelEntry,
  CatalogProvider,
  ProviderCatalog,
} from "@houston/protocol";
import {
  addCandidate,
  type Candidate,
  type Draft,
  finalize,
  foldEnrichment,
} from "../src/lib/ai-hub/catalog-merge.ts";
import { piCatalogToCandidates } from "../src/lib/ai-hub/catalog-pi.ts";
import type { RawModel } from "../src/lib/ai-hub/catalog-snapshot.ts";

/** Compact CatalogModelEntry builder with sane defaults. */
function entry(
  id: string,
  opts: Partial<CatalogModelEntry> & { name?: string } = {},
): CatalogModelEntry {
  return {
    id,
    name: opts.name ?? id,
    pricing: opts.pricing ?? { input: 3, output: 15 },
    contextWindow: opts.contextWindow ?? 200_000,
    maxTokens: opts.maxTokens ?? 8_192,
    reasoning: opts.reasoning ?? false,
    vision: opts.vision ?? false,
  };
}

const provider = (
  id: string,
  auth: CatalogProvider["auth"],
  models: CatalogModelEntry[],
): CatalogProvider => ({ id, name: id, auth, models });

describe("piCatalogToCandidates maps the pi-ai catalog to merge candidates", () => {
  const catalog: ProviderCatalog = [
    // pi's DIRECT api-key OpenAI — collides with the codex rename, dropped.
    provider("openai", "apiKey", [entry("gpt-4o"), entry("gpt-4o-mini")]),
    // OAuth Codex — renamed to `openai`, marked subscription.
    provider("openai-codex", "oauth", [
      entry("gpt-5.5", {
        reasoning: true,
        vision: true,
        maxTokens: 64_000,
        contextWindow: 272_000,
        pricing: { input: 1.25, output: 10 },
      }),
    ]),
    provider("groq", "apiKey", [
      entry("llama-4-scout", {
        vision: true,
        pricing: { input: 0.5, output: 1.5 },
      }),
    ]),
  ];
  const candidates = piCatalogToCandidates(catalog);

  it("applies DROP_PI_PROVIDERS: pi's direct openai models never map", () => {
    const ids = candidates.map((c) => c.raw.id);
    ok(!ids.includes("gpt-4o") && !ids.includes("gpt-4o-mini"));
  });

  it("applies PROVIDER_ID_RENAME: openai-codex → openai, no raw codex id", () => {
    ok(!candidates.some((c) => c.providerId === "openai-codex"));
    const openai = candidates.find((c) => c.providerId === "openai");
    ok(openai, "expected a renamed openai candidate");
  });

  it("preserves the pi model id verbatim as the offer model id", () => {
    const openai = candidates.find((c) => c.providerId === "openai");
    strictEqual(openai?.raw.id, "gpt-5.5");
  });

  it("maps pi pricing to costIn / costOut", () => {
    const openai = candidates.find((c) => c.providerId === "openai");
    strictEqual(openai?.raw.costIn, 1.25);
    strictEqual(openai?.raw.costOut, 10);
  });

  it("turns pi vision into an image input modality", () => {
    const openai = candidates.find((c) => c.providerId === "openai");
    deepStrictEqual(openai?.raw.input, ["text", "image"]);
    const groq = candidates.find((c) => c.providerId === "groq");
    deepStrictEqual(groq?.raw.input, ["text", "image"]);
  });

  it("maps reasoning and maxTokens → output", () => {
    const openai = candidates.find((c) => c.providerId === "openai");
    strictEqual(openai?.raw.reasoning, true);
    strictEqual(openai?.raw.output, 64_000);
    const groq = candidates.find((c) => c.providerId === "groq");
    strictEqual(groq?.raw.reasoning, undefined);
  });

  it("marks subscription from provider.auth === oauth", () => {
    strictEqual(
      candidates.find((c) => c.providerId === "openai")?.subscription,
      true,
    );
    strictEqual(
      candidates.find((c) => c.providerId === "groq")?.subscription,
      false,
    );
  });

  it("detects the lab from the (renamed) provider id + model", () => {
    strictEqual(
      candidates.find((c) => c.providerId === "openai")?.lab,
      "openai",
    );
    strictEqual(candidates.find((c) => c.providerId === "groq")?.lab, "meta");
  });
});

describe("snapshot enrichment is gated to pi-existing models", () => {
  function raw(key: string, extra: Partial<RawModel> = {}): RawModel {
    return { key, id: key, name: key, ...extra };
  }
  function piCandidate(key: string, providerId: string): Candidate {
    return {
      providerId,
      raw: raw(key, { costIn: 3, costOut: 15, context: 200_000 }),
      subscription: false,
      lab: "other",
    };
  }
  function build(cands: Candidate[], enrich: RawModel[]): Map<string, Draft> {
    const drafts = new Map<string, Draft>();
    for (const c of cands) addCandidate(drafts, c);
    for (const r of enrich) foldEnrichment(drafts, r);
    return drafts;
  }
  function draftFor(drafts: Map<string, Draft>, key: string): Draft {
    const draft = drafts.get(key);
    ok(draft, `expected a draft for ${key}`);
    return draft;
  }

  it("a pi-ai model gains snapshot imageGen / description / toolCall / release date", () => {
    const drafts = build(
      [piCandidate("model-x", "openrouter")],
      [
        raw("model-x", {
          description: "A capable model.",
          imageGen: true,
          toolCall: true,
          releaseDate: "2025-06-01",
        }),
      ],
    );
    const m = finalize("model-x", draftFor(drafts, "model-x"));
    strictEqual(m.description, "A capable model.");
    strictEqual(m.imageGen, true);
    strictEqual(m.toolCall, true);
    strictEqual(m.releaseDate, "2025-06-01");
    // Existence + economics stay pi's.
    deepStrictEqual(
      m.offers.map((o) => o.providerId),
      ["openrouter"],
    );
    strictEqual(m.offers[0].costInput, 3);
  });

  it("drops a snapshot-only model: enrichment with no pi twin is a no-op", () => {
    const drafts = build(
      [piCandidate("model-x", "openrouter")],
      [raw("ghost-model", { description: "Not runnable.", imageGen: true })],
    );
    strictEqual(drafts.size, 1);
    ok(!drafts.has("ghost-model"), "snapshot-only key must not create a draft");
  });

  it("a pi-ai-only model appears without enrichment", () => {
    const drafts = build([piCandidate("model-y", "google")], []);
    const m = finalize("model-y", draftFor(drafts, "model-y"));
    strictEqual(m.description, undefined);
    strictEqual(m.imageGen, false);
    strictEqual(m.toolCall, false);
    strictEqual(m.releaseDate, undefined);
    strictEqual(m.offers.length, 1);
  });
});
