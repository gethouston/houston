import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import { resolveAgentModelOverrides } from "../src/lib/agent-model-overrides.ts";
import {
  coherentPinModel,
  resolveChatModelPin,
} from "../src/lib/chat-model-pin.ts";
import {
  getContextWindowConfig,
  getEffortLevels,
  getModel,
  getProvider,
  hydrateProviderCatalog,
  validEffortOrDefault,
  validModelOrNull,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

const HIDDEN = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
const NONE = { provider: null, model: null };

before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

describe("Codex rows hidden from the picker", () => {
  it("are absent from the picker's model list", () => {
    const listed = getProvider("openai")?.models.map((m) => m.id) ?? [];
    for (const id of HIDDEN) ok(!listed.includes(id), id);
  });

  it("still resolve with their own window and effort ladder", () => {
    for (const id of HIDDEN) {
      strictEqual(getModel("openai", id)?.id, id);
      strictEqual(validModelOrNull("openai-codex", id), id);
      deepStrictEqual(getContextWindowConfig("openai", id), {
        default: 258_400,
        max: 828_400,
        inputLimit: 922_000,
      });
      ok(getEffortLevels("openai", id).length > 0, id);
      strictEqual(validEffortOrDefault("openai", id, "high"), "high");
    }
  });

  it("keep a chat pinned to one on that model", () => {
    deepStrictEqual(
      resolveChatModelPin(
        "openai",
        { provider: "openai-codex", model: "gpt-5.6-sol" },
        NONE,
      ),
      { provider: "openai", model: "gpt-5.6-sol", source: "mission" },
    );
    strictEqual(coherentPinModel("openai", "gpt-5.6-terra"), "gpt-5.6-terra");
  });

  it("keep an agent configured on one on that model", () => {
    deepStrictEqual(
      resolveAgentModelOverrides({
        provider: "openai-codex",
        model: "gpt-5.6-luna",
      }),
      { providerOverride: "openai", modelOverride: "gpt-5.6-luna" },
    );
  });
});

describe("rows hidden because the provider no longer runs them", () => {
  it("still fall back to the provider default", () => {
    strictEqual(getModel("openai", "gpt-5.5"), undefined);
    strictEqual(validModelOrNull("openai", "gpt-5.5"), null);
    deepStrictEqual(
      resolveChatModelPin(
        "openai",
        { provider: "openai-codex", model: "gpt-5.5" },
        NONE,
      ),
      {
        provider: "openai",
        model: getProvider("openai")?.defaultModel,
        source: "deployment",
      },
    );
    strictEqual(getModel("google", "gemini-2.5-pro"), undefined);
  });
});
