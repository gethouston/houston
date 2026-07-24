import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import {
  EFFORT_ORDER,
  getContextWindowConfig,
  getDefaultModel,
  getEffortLevels,
  getModel,
  getProvider,
  hydrateProviderCatalog,
  modelAcceptsImages,
  normalizeEffort,
  normalizeLegacyModel,
  PROVIDERS,
  validEffortOrDefault,
  validModelOrNull,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

// Hydrate once from the sample pi catalog; every case reads the in-place cache.
before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

describe("hydrateProviderCatalog: rename + drop", () => {
  it("renames pi `openai-codex` → `openai` and keeps its Codex models", () => {
    strictEqual(getProvider("openai-codex"), undefined);
    const openai = getProvider("openai");
    strictEqual(openai?.name, "OpenAI");
    strictEqual(openai?.auth, "oauth");
    ok(openai?.models.some((m) => m.id === "gpt-5.5"));
  });

  it("drops pi's colliding DIRECT api-key `openai` provider entirely", () => {
    // Exactly one provider now owns the `openai` id, and it is the Codex one —
    // the direct provider's gpt-4o models must be gone.
    strictEqual(PROVIDERS.filter((p) => p.id === "openai").length, 1);
    strictEqual(getModel("openai", "gpt-4o"), undefined);
  });
});

describe("hydrateProviderCatalog: local provider + auth", () => {
  it("appends the local OpenAI-compatible provider pi has no concept of", () => {
    const local = getProvider("openai-compatible");
    strictEqual(local?.auth, "openaiCompatible");
    strictEqual(local?.models.length, 0);
    strictEqual(PROVIDERS.at(-1)?.id, "openai-compatible");
  });

  it("derives auth: pi oauth → oauth, pi apiKey → apiKey", () => {
    strictEqual(getProvider("anthropic")?.auth, "oauth");
    strictEqual(getProvider("minimax")?.auth, "apiKey");
    strictEqual(getProvider("groq")?.auth, "apiKey");
  });
});

describe("hydrateProviderCatalog: model metadata", () => {
  it("layers override label + description over pi's raw model name", () => {
    const sonnet = getModel("anthropic", "claude-sonnet-5");
    strictEqual(sonnet?.label, "Sonnet 5");
    ok(sonnet && sonnet.description.length > 0);
  });

  it("keeps the catalog's vision flag as acceptsImages (the composer image gate reads it)", () => {
    strictEqual(getModel("openai", "gpt-5.6-sol")?.acceptsImages, true);
    strictEqual(getModel("openai", "gpt-5.6-luna")?.acceptsImages, false);
    strictEqual(modelAcceptsImages("openai", "gpt-5.6-sol"), true);
    strictEqual(modelAcceptsImages("openai", "gpt-5.6-luna"), false);
    // Unknown model / provider = unknown, never a definitive block.
    strictEqual(modelAcceptsImages("openai", "no-such-model"), undefined);
    strictEqual(modelAcceptsImages(null, null), undefined);
  });

  it("takes the model window from pi, and the snap-up ceiling from the override", () => {
    // Sonnet 4.6: pi reports 200k (the default estimate); override adds the
    // credit-gated 1M snap-up.
    deepStrictEqual(getContextWindowConfig("anthropic", "claude-sonnet-4-6"), {
      default: 200_000,
      max: 1_000_000,
    });
    // Sonnet 5: flat 1M from pi, no override ceiling → default === max.
    deepStrictEqual(getContextWindowConfig("anthropic", "claude-sonnet-5"), {
      default: 1_000_000,
      max: 1_000_000,
    });
  });

  it("derives the effort set straight from pi (no hand-curated per-model list)", () => {
    // Both are reasoning models with pi's full ladder in the fixture → the
    // four-tier low→xhigh spectrum, with no retired `max`.
    deepStrictEqual(getEffortLevels("anthropic", "claude-sonnet-4-6"), [
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    deepStrictEqual(getEffortLevels("anthropic", "claude-opus-4-8"), [
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  it("hides the effort row for a non-reasoning model", () => {
    // gpt-4.1 is non-reasoning in the fixture → pi reports no thinking levels,
    // so the derived set is empty and the effort row is omitted (no override).
    strictEqual(getModel("github-copilot", "gpt-4.1")?.effortLevels, undefined);
    strictEqual(getEffortLevels("github-copilot", "gpt-4.1").length, 0);
  });
});

describe("hydrateProviderCatalog: a genuinely new provider (no override)", () => {
  it("surfaces `groq` with pi's own name and its models", () => {
    const groq = getProvider("groq");
    strictEqual(groq?.name, "Groq");
    deepStrictEqual(
      groq?.models.map((m) => m.id),
      ["llama-4-scout", "llama-3.3-70b"],
    );
  });

  it("derives its effort straight from pi thinkingLevels (off/minimal dropped)", () => {
    deepStrictEqual(getEffortLevels("groq", "llama-4-scout"), [
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    // A non-reasoning model gets no effort row.
    strictEqual(getEffortLevels("groq", "llama-3.3-70b").length, 0);
  });

  it("labels a no-override model with pi's model name and no description", () => {
    const model = getModel("groq", "llama-3.3-70b");
    strictEqual(model?.label, "llama-3.3-70b");
    strictEqual(model?.description, "");
  });
});

describe("normalizeEffort (legacy `max` tolerance)", () => {
  it("maps a persisted `max` to `xhigh`, passes everything else through", () => {
    strictEqual(normalizeEffort("max"), "xhigh");
    strictEqual(normalizeEffort("low"), "low");
    strictEqual(normalizeEffort("xhigh"), "xhigh");
    // null/undefined stay as-is so it composes in `??` chains.
    strictEqual(normalizeEffort(null), null);
    strictEqual(normalizeEffort(undefined), undefined);
  });
});

describe("helpers read the hydrated cache", () => {
  it("getDefaultModel: override pick for curated, first model for new providers", () => {
    strictEqual(getDefaultModel("anthropic"), "claude-sonnet-5");
    strictEqual(getDefaultModel("groq"), "llama-4-scout");
  });

  it("validModelOrNull: authoritative for curated, pass-through for open catalogs", () => {
    strictEqual(
      validModelOrNull("anthropic", "claude-opus-4-8"),
      "claude-opus-4-8",
    );
    strictEqual(validModelOrNull("anthropic", "gpt-5.5-codex"), null);
    // OpenRouter + the two OpenCode gateways run ids pi doesn't enumerate.
    strictEqual(validModelOrNull("openrouter", "x-ai/grok-5"), "x-ai/grok-5");
    strictEqual(
      validModelOrNull("opencode", "some-routed-model"),
      "some-routed-model",
    );
  });

  it("validEffortOrDefault clamps against the hydrated model's levels", () => {
    // A persisted legacy `max` normalizes to the top tier the model accepts,
    // so an agent carrying it keeps its top-tier reasoning (not the default).
    strictEqual(
      validEffortOrDefault("anthropic", "claude-sonnet-4-6", "max"),
      "xhigh",
    );
    strictEqual(
      validEffortOrDefault("anthropic", "claude-sonnet-4-6", "xhigh"),
      "xhigh",
    );
    // Garbage clamps to the shared default.
    strictEqual(
      validEffortOrDefault("anthropic", "claude-sonnet-4-6", "bogus"),
      "medium",
    );
    // A model with no effort row → undefined (caller omits the flag).
    strictEqual(
      validEffortOrDefault("github-copilot", "gpt-4.1", "high"),
      undefined,
    );
  });

  it("normalizeLegacyModel still resolves retired aliases against the cache", () => {
    strictEqual(
      validModelOrNull("anthropic", normalizeLegacyModel("opus")),
      "claude-opus-5",
    );
    strictEqual(
      validModelOrNull("anthropic", normalizeLegacyModel("sonnet")),
      "claude-sonnet-4-6",
    );
  });
});

describe("hydrated catalog invariants", () => {
  it("every model's effort levels are an ascending prefix of EFFORT_ORDER", () => {
    const order = new Set(EFFORT_ORDER);
    for (const p of PROVIDERS) {
      for (const m of p.models) {
        const levels = m.effortLevels ?? [];
        for (const e of levels) {
          ok(order.has(e), `${p.id}/${m.id} effort "${e}" is in EFFORT_ORDER`);
        }
        const positions = levels.map((e) => EFFORT_ORDER.indexOf(e));
        const ascending = positions.every(
          (pos, i) => i === 0 || pos > positions[i - 1],
        );
        ok(ascending, `${p.id}/${m.id} effortLevels ascend by EFFORT_ORDER`);
      }
    }
  });

  it("every model carries a positive context window (from pi)", () => {
    for (const p of PROVIDERS) {
      for (const m of p.models) {
        ok(
          typeof m.contextWindow === "number" && m.contextWindow > 0,
          `${p.id}/${m.id} has a context window`,
        );
      }
    }
  });
});
