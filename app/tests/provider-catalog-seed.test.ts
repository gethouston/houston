import { deepStrictEqual, doesNotThrow, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  deriveEffortLevels,
  getDefaultModel,
  getModel,
  getProvider,
} from "../src/lib/providers.ts";

describe("deriveEffortLevels (pure pi thinkingLevels → EffortLevel mapping)", () => {
  it("drops pi's off + minimal, passes low/medium/high/xhigh through in order", () => {
    deepStrictEqual(
      deriveEffortLevels(
        ["off", "minimal", "low", "medium", "high", "xhigh"],
        true,
      ),
      ["low", "medium", "high", "xhigh"],
    );
  });

  it("passes a partial ladder through, preserving low→high order", () => {
    deepStrictEqual(
      deriveEffortLevels(["off", "minimal", "low", "high"], true),
      ["low", "high"],
    );
    deepStrictEqual(deriveEffortLevels(["high", "xhigh"], true), [
      "high",
      "xhigh",
    ]);
  });

  it("is empty for a non-reasoning model even if pi lists levels", () => {
    deepStrictEqual(deriveEffortLevels(["low", "medium", "high"], false), []);
  });

  it("is empty when a reasoning model has no / undefined thinking levels", () => {
    deepStrictEqual(deriveEffortLevels(undefined, true), []);
    deepStrictEqual(deriveEffortLevels([], true), []);
  });

  it("ignores unknown levels pi has no Houston mapping for (e.g. a stray 'max')", () => {
    deepStrictEqual(deriveEffortLevels(["low", "max", "high"], true), [
      "low",
      "high",
    ]);
  });
});

describe("override-only seed (before the pi catalog loads)", () => {
  it("returns each bespoke provider from its override, with an EMPTY model list", () => {
    const anthropic = getProvider("anthropic");
    strictEqual(anthropic?.name, "Anthropic");
    strictEqual(anthropic?.auth, "oauth");
    strictEqual(anthropic?.subtitle, "Claude Code");
    strictEqual(anthropic?.models.length, 0);
    strictEqual(anthropic?.defaultModel, "claude-sonnet-5-5");
  });

  it("seeds the OpenAI card under the `openai` id, reachable in either dialect", () => {
    strictEqual(getProvider("openai")?.name, "OpenAI");
    strictEqual(getProvider("openai")?.auth, "oauth");
    strictEqual(getProvider("openai-codex")?.id, "openai");
  });

  it("includes the local OpenAI-compatible provider in the seed", () => {
    const local = getProvider("openai-compatible");
    strictEqual(local?.auth, "openaiCompatible");
    strictEqual(local?.models.length, 0);
  });

  it("never fabricates a default model it cannot know (B4)", () => {
    strictEqual(getDefaultModel("groq"), "");
    strictEqual(getDefaultModel("openai-compatible"), "");
    strictEqual(getDefaultModel("openai-codex"), "gpt-6-luna");
  });

  it("does not throw from any read helper while models are empty", () => {
    doesNotThrow(() => {
      getModel("anthropic", "claude-sonnet-5");
      getDefaultModel("anthropic");
      getProvider("groq");
    });
    strictEqual(getModel("anthropic", "claude-sonnet-5"), undefined);
  });
});
