import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { LiveCatalog, LiveCatalogModel } from "@houston/protocol";
import { loadHubCatalog } from "../src/lib/ai-hub/catalog.ts";
import { detectLab } from "../src/lib/ai-hub/catalog-lab.ts";
import { liveCatalogToRaw } from "../src/lib/ai-hub/catalog-live.ts";

/** A live-catalog model with sensible defaults for the fields under test. */
function live(over: Partial<LiveCatalogModel> = {}): LiveCatalogModel {
  return {
    id: "openai/some-model",
    name: "Some Model",
    pricing: { inPerMtok: 1, outPerMtok: 2 },
    capabilities: {
      vision: false,
      reasoning: false,
      tools: false,
      imageGen: false,
    },
    ...over,
  };
}

describe("liveCatalogToRaw", () => {
  it("maps pricing to per-1M input/output costs", () => {
    const [raw] = liveCatalogToRaw([
      live({ pricing: { inPerMtok: 3.5, outPerMtok: 12 } }),
    ]);
    strictEqual(raw?.costIn, 3.5);
    strictEqual(raw?.costOut, 12);
  });

  it("turns vision into an image input modality (feeds capabilitiesOf's vision)", () => {
    const [withVision] = liveCatalogToRaw([
      live({ capabilities: caps({ vision: true }) }),
    ]);
    deepStrictEqual(withVision?.input, ["text", "image"]);
    const [without] = liveCatalogToRaw([live()]);
    strictEqual(without?.input, undefined);
  });

  it("carries reasoning / tools / imageGen capability flags", () => {
    const [raw] = liveCatalogToRaw([
      live({
        capabilities: caps({ reasoning: true, tools: true, imageGen: true }),
      }),
    ]);
    strictEqual(raw?.reasoning, true);
    strictEqual(raw?.toolCall, true);
    strictEqual(raw?.imageGen, true);
  });

  it("leaves capability flags undefined when the live model lacks them", () => {
    const [raw] = liveCatalogToRaw([live()]);
    strictEqual(raw?.reasoning, undefined);
    strictEqual(raw?.toolCall, undefined);
    strictEqual(raw?.imageGen, undefined);
  });

  it("preserves the vendor/model id so detectLab reads the right lab", () => {
    const [raw] = liveCatalogToRaw([
      live({ id: "x-ai/grok-5", name: "Grok 5" }),
    ]);
    ok(raw, "one raw model out");
    strictEqual(raw.id, "x-ai/grok-5");
    strictEqual(detectLab("openrouter", raw), "xai");
  });

  it("copies description and context window when present", () => {
    const [raw] = liveCatalogToRaw([
      live({ description: "hello", contextWindow: 200000 }),
    ]);
    strictEqual(raw?.description, "hello");
    strictEqual(raw?.context, 200000);
  });
});

describe("live catalog folded through the merge", () => {
  it("attaches a live capability to an existing snapshot model (same key)", async () => {
    // Claude Opus 4.8 is in the baked openrouter bucket without an imageGen
    // signal; a live openrouter entry that reports imageGen must light it up on
    // the SAME merged model (proving the live offer folded onto it, not a dup).
    const baseline = await loadHubCatalog(["openrouter"]);
    const before = baseline.byKey.get("claude opus 4.8");
    ok(before, "snapshot has an openrouter Claude Opus 4.8");
    strictEqual(before?.imageGen, false, "snapshot carries no imageGen");

    const liveCatalog: LiveCatalog = [
      live({
        id: "anthropic/claude-opus-4.8",
        name: "Claude Opus 4.8",
        capabilities: caps({ imageGen: true }),
      }),
    ];
    const merged = await loadHubCatalog(
      ["openrouter"],
      liveCatalogToRaw(liveCatalog),
    );
    const after = merged.byKey.get("claude opus 4.8");
    strictEqual(after?.imageGen, true, "live imageGen folded onto the model");
    strictEqual(
      merged.byKey.size,
      baseline.byKey.size,
      "no duplicate model appeared",
    );
    strictEqual(
      after?.offers.filter((o) => o.providerId === "openrouter").length,
      1,
      "still exactly one openrouter offer",
    );
  });

  it("makes LIVE pricing/context authoritative over the baked snapshot (same key), union caps", async () => {
    // Opus 4.8 is in the baked openrouter bucket with its own pricing/context.
    // A live openrouter entry for the SAME model must override the merged
    // offer's economics (pricing + context) while its capability lights up on
    // the union — proving live wins economics, not the stale baked numbers.
    const baseline = await loadHubCatalog(["openrouter"]);
    const snapOffer = baseline.byKey
      .get("claude opus 4.8")
      ?.offers.find((o) => o.providerId === "openrouter");
    ok(snapOffer, "snapshot has an openrouter Claude Opus 4.8 offer");
    // Choose live numbers that differ from the snapshot so the assertions bite.
    const liveIn = (snapOffer?.costInput ?? 0) + 3;
    const liveOut = (snapOffer?.costOutput ?? 0) + 7;
    const liveContext = (snapOffer?.context ?? 0) + 500_000;

    const liveCatalog: LiveCatalog = [
      live({
        id: "anthropic/claude-opus-4.8",
        name: "Claude Opus 4.8",
        pricing: { inPerMtok: liveIn, outPerMtok: liveOut },
        contextWindow: liveContext,
        capabilities: caps({ imageGen: true }),
      }),
    ];
    const merged = await loadHubCatalog(
      ["openrouter"],
      liveCatalogToRaw(liveCatalog),
    );
    const model = merged.byKey.get("claude opus 4.8");
    const offer = model?.offers.find((o) => o.providerId === "openrouter");
    strictEqual(offer?.costInput, liveIn, "offer uses LIVE input price");
    strictEqual(offer?.costOutput, liveOut, "offer uses LIVE output price");
    strictEqual(offer?.context, liveContext, "offer uses LIVE context window");
    strictEqual(model?.imageGen, true, "capabilities unioned (live imageGen)");
    strictEqual(model?.toolCall, true, "snapshot tool-call capability kept");
    // Recency stays snapshot-derived (live carries no releaseDate).
    strictEqual(
      model?.releaseDate,
      baseline.byKey.get("claude opus 4.8")?.releaseDate,
      "releaseDate preserved from the snapshot, not dropped by live",
    );
    strictEqual(
      merged.byKey.size,
      baseline.byKey.size,
      "no duplicate model appeared",
    );
  });

  it("adds an OpenRouter-only model as a new entry with lab + offer", async () => {
    const liveCatalog: LiveCatalog = [
      live({
        id: "x-ai/grok-imagine-9",
        name: "Grok Imagine 9",
        pricing: { inPerMtok: 4, outPerMtok: 8 },
        capabilities: caps({ imageGen: true, vision: true }),
      }),
    ];
    const merged = await loadHubCatalog(
      ["openrouter"],
      liveCatalogToRaw(liveCatalog),
    );
    const model = merged.byKey.get("grok imagine 9");
    ok(model, "the OpenRouter-only model appears");
    strictEqual(model?.lab, "xai", "lab derived from the x-ai/ id prefix");
    strictEqual(model?.imageGen, true);
    ok(model?.inputModalities.includes("image"), "vision → image input");
    const offer = model?.offers.find((o) => o.providerId === "openrouter");
    strictEqual(offer?.costInput, 4);
    strictEqual(offer?.costOutput, 8);
    strictEqual(offer?.modelId, "x-ai/grok-imagine-9");
  });

  it("drops live models when OpenRouter is not among the visible providers", async () => {
    // Guard: even if a caller passes live models, the merge's visibility gate
    // still applies — an OpenRouter-only model must not leak into an OAuth-only
    // catalog. (The hook only fetches live when openrouter is visible anyway.)
    const merged = await loadHubCatalog(
      ["anthropic"],
      liveCatalogToRaw([
        live({ id: "x-ai/grok-imagine-9", name: "Grok Imagine 9" }),
      ]),
    );
    strictEqual(merged.byKey.get("grok imagine 9"), undefined);
  });
});

/** A capabilities object with all flags off except the given overrides. */
function caps(
  over: Partial<LiveCatalogModel["capabilities"]> = {},
): LiveCatalogModel["capabilities"] {
  return {
    vision: false,
    reasoning: false,
    tools: false,
    imageGen: false,
    ...over,
  };
}
