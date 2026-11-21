import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  composerSendOverrides,
  settleOnPin,
} from "../src/components/board/composer-send-overrides.ts";

describe("composerSendOverrides", () => {
  it("carries the effort the picker shows beside the provider and model", () => {
    deepStrictEqual(
      composerSendOverrides(
        { provider: "openai", model: "gpt-6-astra", effort: "high" },
        "plan",
      ),
      {
        providerOverride: "openai",
        modelOverride: "gpt-6-astra",
        effortOverride: "high",
        modeOverride: "plan",
      },
    );
  });

  it("leaves effort absent for a model with no effort levels", () => {
    const overrides = composerSendOverrides(
      { provider: "openai-compatible", model: "local" },
      "execute",
    );
    deepStrictEqual(overrides.effortOverride, undefined);
  });
});

describe("settleOnPin", () => {
  const rendered = {
    providerOverride: "anthropic",
    modelOverride: "claude-sonnet-5-5",
    effortOverride: "low",
    modeOverride: "auto" as const,
    mentions: [{ userId: "u1", name: "Ana" }],
    sentForPerson: true as const,
  };

  it("replaces provider, model AND effort with the settled pin", () => {
    deepStrictEqual(
      settleOnPin(rendered, {
        provider: "anthropic",
        model: "claude-opus-5-5",
        effort: "max",
      }),
      {
        ...rendered,
        modelOverride: "claude-opus-5-5",
        effortOverride: "max",
      },
    );
  });

  it("does not keep a rendered effort the settled model has no levels for", () => {
    const settled = settleOnPin(rendered, {
      provider: "openai-compatible",
      model: "local",
    });
    deepStrictEqual(settled.effortOverride, undefined);
    deepStrictEqual(settled.modeOverride, "auto");
    deepStrictEqual(settled.mentions, rendered.mentions);
  });
});
