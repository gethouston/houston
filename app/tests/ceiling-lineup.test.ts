import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type CeilingResolver,
  pickCeilingPin,
} from "../src/lib/ceiling-pin.ts";
import { resolvePersonalModelPin } from "../src/lib/model-selector-lock.ts";

/**
 * A ceiling written before the Claude lineup moved names retired ids
 * ("Claude Opus 5" = `anthropic/claude-opus-5` + `claude-opus-5`). The anthropic
 * provider runs `claude-opus-5` as `claude-opus-5-5`, and the catalog says so
 * with `runsAs` on that provider's row only. A Claude-only member must land on
 * anthropic's lineup model, never on an OpenRouter account they never
 * connected, and the retired entry must never unlock the lineup id on another
 * provider. Mirrors the gateway's clamp (cloud `internal/edge/agents/ceiling.go`).
 */

// What the picker can offer per provider once hydrated: anthropic shows only
// its lineup; its retired rows are hidden but still carry `runsAs`.
const visible: Record<string, string[]> = {
  anthropic: [
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-fable-5-2",
    "claude-haiku-5-5",
  ],
  opencode: ["claude-opus-5", "claude-opus-5-5"],
  openrouter: ["anthropic/claude-opus-5", "anthropic/claude-haiku-4.5"],
};
const runsAsRows: Record<string, Record<string, string>> = {
  anthropic: {
    "claude-opus-5": "claude-opus-5-5",
    "claude-sonnet-5": "claude-sonnet-5-5",
    "claude-haiku-4-5": "claude-haiku-5-5",
  },
};

const resolver = (connected: string[]): CeilingResolver => ({
  offers: (provider, model) => visible[provider]?.includes(model) ?? false,
  providerFor: (model) =>
    Object.keys(visible).find((p) => visible[p]?.includes(model)) ?? null,
  runsAs: (provider, model) => runsAsRows[provider]?.[model] ?? null,
  connected,
});

const retiredOpus = ["anthropic/claude-opus-5", "claude-opus-5"];
const haikuOnly = ["anthropic/claude-haiku-4.5", "claude-haiku-4-5"];
const claudeFallback = {
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  effort: "high",
};
const claudeOnly = resolver(["anthropic"]);

describe("a retired-id ceiling on a Claude-only member", () => {
  it("pins anthropic's lineup model, not OpenRouter", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        null,
        retiredOpus,
        claudeFallback,
        null,
        claudeOnly,
      ),
      { provider: "anthropic", model: "claude-opus-5-5", effort: "high" },
    );
    deepStrictEqual(pickCeilingPin(retiredOpus, claudeFallback, resolver([])), {
      provider: "anthropic",
      model: "claude-opus-5-5",
      effort: "high",
    });
  });

  it("keeps an in-ceiling lineup fallback as it is", () => {
    const opus = { ...claudeFallback, model: "claude-opus-5-5" };
    deepStrictEqual(
      resolvePersonalModelPin(null, retiredOpus, opus, null, claudeOnly),
      opus,
    );
  });

  it("honors a stored lineup choice and a stored retired choice", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "anthropic", model: "claude-opus-5-5", effort: "low" },
        retiredOpus,
        claudeFallback,
        null,
        claudeOnly,
      ),
      { provider: "anthropic", model: "claude-opus-5-5", effort: "low" },
    );
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "anthropic", model: "claude-opus-5", effort: "low" },
        retiredOpus,
        claudeFallback,
        null,
        claudeOnly,
      ),
      { provider: "anthropic", model: "claude-opus-5", effort: "low" },
    );
  });

  it("honors an open mission's lineup pin", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        null,
        retiredOpus,
        claudeFallback,
        { provider: "anthropic", model: "claude-opus-5-5" },
        claudeOnly,
      ),
      { provider: "anthropic", model: "claude-opus-5-5", effort: "high" },
    );
  });
});

describe("a retired anthropic entry never widens another provider", () => {
  it("does not admit the lineup id on opencode", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "opencode", model: "claude-opus-5-5", effort: "low" },
        retiredOpus,
        { provider: "opencode", model: "claude-opus-5-5", effort: "high" },
        null,
        resolver(["opencode"]),
      ),
      { provider: "opencode", model: "claude-opus-5", effort: "low" },
    );
  });

  it("ignores a mission pin of the lineup id on opencode", () => {
    const personal = resolvePersonalModelPin(
      null,
      retiredOpus,
      claudeFallback,
      { provider: "opencode", model: "claude-opus-5-5" },
      claudeOnly,
    );
    deepStrictEqual(personal, {
      provider: "anthropic",
      model: "claude-opus-5-5",
      effort: "high",
    });
  });
});

describe("a Haiku-only ceiling", () => {
  it("runs anthropic's Haiku 5.5, not OpenRouter", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        null,
        haikuOnly,
        claudeFallback,
        null,
        claudeOnly,
      ),
      { provider: "anthropic", model: "claude-haiku-5-5", effort: "high" },
    );
  });
});
