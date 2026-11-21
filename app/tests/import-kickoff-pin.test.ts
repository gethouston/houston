import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveKickoffPin } from "../src/components/portable/import-kickoff-pin.ts";
import { getDefaultModel } from "../src/lib/providers.ts";

describe("resolveKickoffPin", () => {
  it("pins the pair the user picked by hand, confirmed or not", () => {
    deepStrictEqual(
      resolveKickoffPin({
        userPickedModel: true,
        provider: "openrouter",
        model: "custom/live-model",
        lastUsedProvider: "anthropic",
        lastUsedModel: getDefaultModel("anthropic"),
        connected: [],
      }),
      { provider: "openrouter", model: "custom/live-model" },
    );
  });

  it("pins the resolved pair when the provider is a confirmed connection", () => {
    deepStrictEqual(
      resolveKickoffPin({
        userPickedModel: false,
        provider: "anthropic",
        model: getDefaultModel("anthropic"),
        lastUsedProvider: "openrouter",
        lastUsedModel: null,
        connected: ["openrouter"],
      }),
      { provider: "openrouter", model: getDefaultModel("openrouter") },
    );
  });

  it("keeps a still-valid last-used model on its confirmed provider", () => {
    deepStrictEqual(
      resolveKickoffPin({
        userPickedModel: false,
        provider: "anthropic",
        model: getDefaultModel("anthropic"),
        lastUsedProvider: "openrouter",
        lastUsedModel: "custom/live-model",
        connected: ["openrouter"],
      }),
      { provider: "openrouter", model: "custom/live-model" },
    );
  });

  it("pins NOTHING when no connection is confirmed", () => {
    deepStrictEqual(
      resolveKickoffPin({
        userPickedModel: false,
        provider: "anthropic",
        model: getDefaultModel("anthropic"),
        lastUsedProvider: "anthropic",
        lastUsedModel: getDefaultModel("anthropic"),
        connected: [],
      }),
      {},
    );
  });

  it("pins nothing when nothing is known at all", () => {
    deepStrictEqual(
      resolveKickoffPin({
        userPickedModel: false,
        provider: "anthropic",
        model: getDefaultModel("anthropic"),
        lastUsedProvider: null,
        lastUsedModel: null,
        connected: [],
      }),
      {},
    );
  });

  it("pins nothing when the scan could not answer", () => {
    deepStrictEqual(
      resolveKickoffPin({
        userPickedModel: false,
        provider: "anthropic",
        model: getDefaultModel("anthropic"),
        lastUsedProvider: "anthropic",
        lastUsedModel: getDefaultModel("anthropic"),
        connected: null,
      }),
      {},
    );
  });

  it("still pins the user's own pick when the scan could not answer", () => {
    deepStrictEqual(
      resolveKickoffPin({
        userPickedModel: true,
        provider: "openrouter",
        model: "custom/live-model",
        lastUsedProvider: null,
        lastUsedModel: null,
        connected: null,
      }),
      { provider: "openrouter", model: "custom/live-model" },
    );
  });
});
