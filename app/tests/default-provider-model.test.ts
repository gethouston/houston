import { deepStrictEqual, notStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { pickDefaultProviderModel } from "../src/lib/default-provider-model.ts";
import { getDefaultModel, PROVIDERS } from "../src/lib/providers.ts";

describe("pickDefaultProviderModel", () => {
  it("keeps a connected last-used provider and valid model", () => {
    deepStrictEqual(
      pickDefaultProviderModel({
        lastUsedProvider: "openrouter",
        lastUsedModel: "custom/live-model",
        connectedProviders: ["anthropic", "openrouter"],
      }),
      {
        provider: "openrouter",
        model: "custom/live-model",
        confirmed: true,
      },
    );
  });

  it("uses the first canonical connected provider when last-used is disconnected", () => {
    const connectedProviders = ["anthropic", "openai"];
    const firstConnected = PROVIDERS.find((provider) =>
      connectedProviders.includes(provider.id),
    )?.id;
    notStrictEqual(firstConnected, undefined);

    deepStrictEqual(
      pickDefaultProviderModel({
        lastUsedProvider: "openrouter",
        lastUsedModel: "custom/live-model",
        connectedProviders,
      }),
      {
        provider: firstConnected,
        model: getDefaultModel(firstConnected as string),
        confirmed: true,
      },
    );
  });

  it("replaces an invalid last-used model with the provider default", () => {
    deepStrictEqual(
      pickDefaultProviderModel({
        lastUsedProvider: "anthropic",
        lastUsedModel: "retired-model",
        connectedProviders: ["anthropic"],
      }),
      {
        provider: "anthropic",
        model: getDefaultModel("anthropic"),
        confirmed: true,
      },
    );
  });

  it("falls back to Anthropic when no provider or model was stored", () => {
    deepStrictEqual(
      pickDefaultProviderModel({
        lastUsedProvider: null,
        lastUsedModel: null,
        connectedProviders: [],
      }),
      {
        provider: "anthropic",
        model: getDefaultModel("anthropic"),
        confirmed: false,
      },
    );
  });

  it("retains the legacy last-used fallback while statuses are empty", () => {
    deepStrictEqual(
      pickDefaultProviderModel({
        lastUsedProvider: "openrouter",
        lastUsedModel: "custom/live-model",
        connectedProviders: new Set<string>(),
      }),
      {
        provider: "openrouter",
        model: "custom/live-model",
        confirmed: false,
      },
    );
  });
});
