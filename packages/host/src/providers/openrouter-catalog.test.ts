import { expect, test } from "vitest";
import { mapOpenRouterCatalog } from "./openrouter-catalog";

/**
 * The mapper is the untrusted-payload boundary: it normalizes OpenRouter's
 * `/api/v1/models` into a protocol `LiveCatalog`, parsing per-token price strings
 * into per-1M-token numbers, deriving the four capability flags, and SKIPPING
 * malformed entries instead of throwing. This sample exercises one of each:
 * vision, reasoning, tools, image-output, a free model, and a junk entry.
 */

// 2026-07-05T00:00:00Z — the injected "now" the isNew window measures against.
const NOW = Date.parse("2026-07-05T00:00:00Z");
// `created` is unix SECONDS; this one is ~5 days before NOW → within 30 days.
const RECENT = Math.floor(NOW / 1000) - 5 * 24 * 60 * 60;
// ~90 days before NOW → outside the window.
const OLD = Math.floor(NOW / 1000) - 90 * 24 * 60 * 60;

const PAYLOAD = {
  data: [
    {
      id: "anthropic/claude-vision",
      name: "Claude Vision",
      description: "A multimodal model.",
      context_length: 200000,
      created: RECENT,
      pricing: { prompt: "0.000003", completion: "0.000015" },
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
      },
      supported_parameters: ["tools", "temperature"],
    },
    {
      id: "openai/o-reasoner",
      name: "O Reasoner",
      context_length: 128000,
      created: OLD,
      pricing: { prompt: "0.00001", completion: "0.00004" },
      architecture: {
        input_modalities: ["text"],
        output_modalities: ["text"],
      },
      supported_parameters: ["reasoning", "tools"],
    },
    {
      id: "black-forest/flux-image",
      name: "Flux Image",
      pricing: { prompt: "0.00002", completion: "0.00002" },
      architecture: {
        input_modalities: ["text"],
        output_modalities: ["image"],
      },
      supported_parameters: [],
    },
    {
      id: "meta/llama-free",
      name: "Llama Free",
      pricing: { prompt: "0", completion: "0" },
      // No architecture / supported_parameters at all — all caps default false.
    },
    // Malformed: no id — must be dropped, not throw.
    {
      name: "Ghost Model",
      pricing: { prompt: "0.1", completion: "0.1" },
    },
    // Malformed: unparseable price — must be dropped.
    {
      id: "broken/nan-price",
      name: "Broken",
      pricing: { prompt: "not-a-number", completion: "0.1" },
    },
  ],
};

test("maps a realistic OpenRouter payload, skipping malformed entries", () => {
  const catalog = mapOpenRouterCatalog(PAYLOAD, NOW);

  // Two malformed entries dropped → 4 valid models survive.
  expect(catalog.map((m) => m.id)).toEqual([
    "anthropic/claude-vision",
    "openai/o-reasoner",
    "black-forest/flux-image",
    "meta/llama-free",
  ]);

  const vision = catalog[0];
  expect(vision).toEqual({
    id: "anthropic/claude-vision",
    name: "Claude Vision",
    description: "A multimodal model.",
    contextWindow: 200000,
    // per-token × 1e6 → per-1M-token USD.
    pricing: { inPerMtok: 3, outPerMtok: 15 },
    capabilities: {
      vision: true,
      imageGen: false,
      reasoning: false,
      tools: true,
    },
    isNew: true,
  });

  const reasoner = catalog[1];
  expect(reasoner?.capabilities).toEqual({
    vision: false,
    imageGen: false,
    reasoning: true,
    tools: true,
  });
  expect(reasoner?.pricing).toEqual({ inPerMtok: 10, outPerMtok: 40 });
  // ~90 days old → not new.
  expect(reasoner?.isNew).toBe(false);

  const flux = catalog[2];
  expect(flux?.capabilities.imageGen).toBe(true);
  // No `created` → isNew stays absent.
  expect(flux?.isNew).toBeUndefined();
  expect(flux?.description).toBeUndefined();
  expect(flux?.contextWindow).toBeUndefined();

  const free = catalog[3];
  expect(free?.pricing).toEqual({ inPerMtok: 0, outPerMtok: 0 });
  expect(free?.capabilities).toEqual({
    vision: false,
    imageGen: false,
    reasoning: false,
    tools: false,
  });
});

test("omits isNew entirely when no clock is injected", () => {
  const catalog = mapOpenRouterCatalog(PAYLOAD);
  for (const m of catalog) expect(m.isNew).toBeUndefined();
});

test("accepts a bare array and tolerates non-catalog input", () => {
  expect(
    mapOpenRouterCatalog([
      { id: "a", name: "A", pricing: { prompt: "0", completion: "0" } },
    ]),
  ).toHaveLength(1);
  expect(mapOpenRouterCatalog(null)).toEqual([]);
  expect(mapOpenRouterCatalog({ nope: true })).toEqual([]);
  expect(mapOpenRouterCatalog("string")).toEqual([]);
});
