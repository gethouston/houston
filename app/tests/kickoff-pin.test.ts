import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { kickoffPinFromScan } from "../src/lib/kickoff-pin.ts";
import { getDefaultModel } from "../src/lib/providers.ts";

describe("kickoffPinFromScan", () => {
  it("pins the last-used pair while its provider is connected", () => {
    deepStrictEqual(
      kickoffPinFromScan({
        connected: ["anthropic", "openrouter"],
        lastUsedProvider: "openrouter",
        lastUsedModel: "custom/live-model",
      }),
      { provider: "openrouter", model: "custom/live-model" },
    );
  });

  it("moves to a connected provider once the last-used one is gone", () => {
    deepStrictEqual(
      kickoffPinFromScan({
        connected: ["openrouter"],
        lastUsedProvider: "anthropic",
        lastUsedModel: getDefaultModel("anthropic"),
      }),
      { provider: "openrouter", model: getDefaultModel("openrouter") },
    );
  });

  it("pins NOTHING when the scan confirms no connection at all", () => {
    deepStrictEqual(
      kickoffPinFromScan({
        connected: [],
        lastUsedProvider: "anthropic",
        lastUsedModel: getDefaultModel("anthropic"),
      }),
      {},
    );
  });

  it("asks for a fresh scan instead of answering from one that cannot tell", () => {
    strictEqual(
      kickoffPinFromScan({
        connected: null,
        lastUsedProvider: "anthropic",
        lastUsedModel: getDefaultModel("anthropic"),
      }),
      null,
    );
  });
});
