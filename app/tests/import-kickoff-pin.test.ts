import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveKickoffPin } from "../src/components/portable/import-kickoff-pin.ts";
import { getDefaultModel } from "../src/lib/providers.ts";

/**
 * What gets PERSISTED onto a freshly imported agent. An unconfirmed guess must
 * never be written, so the pin stays empty unless the user picked the pair by
 * hand or the resolved provider is a confirmed connection.
 */

describe("resolveKickoffPin", () => {
  it("pins the pair the user picked by hand, confirmed or not", () => {
    deepStrictEqual(
      resolveKickoffPin({
        userPickedModel: true,
        provider: "openrouter",
        model: "custom/live-model",
        lastUsedProvider: "anthropic",
        lastUsedModel: getDefaultModel("anthropic"),
        connectedProviders: [],
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
        connectedProviders: ["openrouter"],
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
        connectedProviders: ["openrouter"],
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
        connectedProviders: [],
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
        connectedProviders: [],
      }),
      {},
    );
  });
});
