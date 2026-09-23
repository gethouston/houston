import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { kickoffPinFromScan } from "../src/lib/kickoff-pin.ts";
import { getDefaultModel } from "../src/lib/providers.ts";

/**
 * The rule every creation path pins by. Three answers, and the difference
 * between two of them is the whole bug this covers: "the scan says nothing is
 * connected" (pin nothing) is not the same claim as "the scan cannot tell"
 * (ask again), and collapsing them is how a new agent got pinned to a provider
 * the user had just signed out of.
 */

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
    // The agent is created with no saved provider, so its first turn falls to
    // whatever is connected — and with nothing connected it surfaces the
    // connect card, which is the honest answer.
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
