import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type CeilingResolver,
  pickCeilingPin,
} from "../src/lib/ceiling-pin.ts";

/**
 * PRODUCT-1657 — a ceiling is the sorted union of every provider's id for each
 * allowed model, so its FIRST entry is usually OpenRouter's (`anthropic/…`
 * sorts before `claude-…`). The pick must land on a provider the user can run,
 * never on whichever provider happens to own the first entry.
 */
const catalog: Record<string, string[]> = {
  anthropic: ["claude-opus-5", "claude-sonnet-5"],
  openai: ["gpt-5.5"],
  openrouter: [
    "anthropic/claude-opus-5",
    "openai/gpt-5.5",
    "~anthropic/claude-opus-latest",
  ],
};

const resolver = (connected: string[]): CeilingResolver => ({
  offers: (provider, model) => catalog[provider]?.includes(model) ?? false,
  providerFor: (model) =>
    Object.keys(catalog).find((p) => catalog[p]?.includes(model)) ?? null,
  connected,
});

// "Claude Opus 5" as the ceiling editor writes it: OpenRouter's id sorts first.
const opusCeiling = ["anthropic/claude-opus-5", "claude-opus-5"];
const fallback = {
  provider: "anthropic",
  model: "claude-sonnet-5",
  effort: "high",
};

describe("pickCeilingPin", () => {
  it("prefers the fallback provider's own id over the first entry", () => {
    deepStrictEqual(
      pickCeilingPin(opusCeiling, fallback, resolver(["anthropic"])),
      {
        provider: "anthropic",
        model: "claude-opus-5",
        effort: "high",
      },
    );
  });

  it("falls to a CONNECTED provider's offer when the fallback provider has none", () => {
    // Only OpenAI is connected and the ceiling is "GPT-5.5" (OpenRouter's id
    // first): run it on OpenAI, not on the OpenRouter account never connected.
    deepStrictEqual(
      pickCeilingPin(
        ["gpt-5.5", "openai/gpt-5.5"].sort(),
        fallback,
        resolver(["openai"]),
      ),
      { provider: "openai", model: "gpt-5.5", effort: "high" },
    );
  });

  it("walks connected providers in registry order", () => {
    deepStrictEqual(
      pickCeilingPin(
        opusCeiling,
        { ...fallback, provider: "google" },
        resolver(["openrouter", "anthropic"]),
      ),
      {
        provider: "openrouter",
        model: "anthropic/claude-opus-5",
        effort: "high",
      },
    );
  });

  it("names the owning provider when nothing connected can run the ceiling", () => {
    // OpenRouter's rolling alias alone: honest "connect OpenRouter", never a
    // Claude pin that the runtime rejects as "not available".
    deepStrictEqual(
      pickCeilingPin(
        ["~anthropic/claude-opus-latest"],
        fallback,
        resolver(["anthropic"]),
      ),
      {
        provider: "openrouter",
        model: "~anthropic/claude-opus-latest",
        effort: "high",
      },
    );
  });

  it("keeps the fallback provider for an id no catalog knows", () => {
    deepStrictEqual(
      pickCeilingPin(["unknown"], fallback, resolver(["anthropic"])),
      {
        provider: "anthropic",
        model: "unknown",
        effort: "high",
      },
    );
  });
});
