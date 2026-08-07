import { deepStrictEqual, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import {
  readAgentModelOverrides,
  resolveAgentModelOverrides,
} from "../src/lib/agent-model-overrides.ts";
import {
  getDefaultModel,
  hydrateProviderCatalog,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

describe("resolveAgentModelOverrides", () => {
  it("pins the agent's configured provider + model (the reported bug: a setup-chat kickoff must run the configured model, not the Sonnet default)", () => {
    deepStrictEqual(
      resolveAgentModelOverrides({
        provider: "anthropic",
        model: "claude-opus-4-8",
      }),
      { providerOverride: "anthropic", modelOverride: "claude-opus-4-8" },
    );
  });

  it("forwards a stored effort the model accepts", () => {
    deepStrictEqual(
      resolveAgentModelOverrides({
        provider: "anthropic",
        model: "claude-opus-4-8",
        effort: "high",
      }),
      {
        providerOverride: "anthropic",
        modelOverride: "claude-opus-4-8",
        effortOverride: "high",
      },
    );
  });

  it("returns no pins when the config names no provider (the runtime keeps resolving the turn itself)", () => {
    deepStrictEqual(resolveAgentModelOverrides({}), {});
    deepStrictEqual(
      resolveAgentModelOverrides({ model: "claude-opus-4-8" }),
      {},
    );
  });

  it("returns no pins for a provider Houston no longer offers", () => {
    deepStrictEqual(
      resolveAgentModelOverrides({ provider: "gemini-cli", model: "x" }),
      {},
    );
  });

  it("falls a stale model back to the provider's catalog default", () => {
    const pins = resolveAgentModelOverrides({
      provider: "anthropic",
      model: "claude-9-imaginary",
    });
    strictEqual(pins.providerOverride, "anthropic");
    strictEqual(pins.modelOverride, "claude-sonnet-5");
  });

  it("normalizes a legacy alias at the same tier (no Opus→Sonnet downgrade)", () => {
    const pins = resolveAgentModelOverrides({
      provider: "anthropic",
      model: "opus",
    });
    strictEqual(pins.modelOverride, "claude-opus-5");
  });
});

// PRODUCT-1236: a setup-chat kickoff is a fresh, message-less turn, so it must
// follow the composer's initial-selection rule and never open on a provider the
// user has not connected. A pin is honored verbatim downstream, so an
// unconnected one is a guaranteed provider error, not a silent switch.
describe("resolveAgentModelOverrides + connected providers", () => {
  it("moves the pin to a connected provider when the configured one is signed out (the reported bug: OpenAI-only user, agent configured for Anthropic)", () => {
    const pins = resolveAgentModelOverrides(
      { provider: "anthropic", model: "claude-opus-4-8" },
      ["openai"],
    );
    strictEqual(pins.providerOverride, "openai");
    // The substitute takes its OWN default — the stored model belongs to the
    // provider the user never connected.
    strictEqual(pins.modelOverride, getDefaultModel("openai"));
  });

  it("drops a stored effort when the pin moves (it was clamped for the other provider's model)", () => {
    const pins = resolveAgentModelOverrides(
      { provider: "anthropic", model: "claude-opus-4-8", effort: "high" },
      ["openai"],
    );
    strictEqual(pins.providerOverride, "openai");
    strictEqual(pins.effortOverride, undefined);
  });

  it("keeps the configured provider when the user IS connected to it", () => {
    deepStrictEqual(
      resolveAgentModelOverrides(
        { provider: "anthropic", model: "claude-opus-4-8" },
        ["openai", "anthropic"],
      ),
      { providerOverride: "anthropic", modelOverride: "claude-opus-4-8" },
    );
  });

  it("picks the substitute in registry order, not scan order", () => {
    const first = resolveAgentModelOverrides({ provider: "anthropic" }, [
      "deepseek",
      "openai",
    ]);
    const reversed = resolveAgentModelOverrides({ provider: "anthropic" }, [
      "openai",
      "deepseek",
    ]);
    strictEqual(first.providerOverride, reversed.providerOverride);
  });

  it("pins a connected provider even when the config names none (never leave the turn to the runtime's Sonnet default)", () => {
    const pins = resolveAgentModelOverrides({}, ["openai"]);
    strictEqual(pins.providerOverride, "openai");
    strictEqual(pins.modelOverride, getDefaultModel("openai"));
  });

  it("defers to the configured provider when connectivity is unconfirmable (null is not 'nothing is connected')", () => {
    deepStrictEqual(
      resolveAgentModelOverrides(
        { provider: "anthropic", model: "claude-opus-4-8" },
        null,
      ),
      { providerOverride: "anthropic", modelOverride: "claude-opus-4-8" },
    );
  });

  it("keeps the configured provider when nothing at all is connected (its sign-in error is the surface)", () => {
    deepStrictEqual(
      resolveAgentModelOverrides(
        { provider: "anthropic", model: "claude-opus-4-8" },
        [],
      ),
      { providerOverride: "anthropic", modelOverride: "claude-opus-4-8" },
    );
  });

  it("still yields no pins when nothing is configured and nothing is connected", () => {
    deepStrictEqual(resolveAgentModelOverrides({}, []), {});
  });

  it("substitutes for a provider Houston no longer offers, too", () => {
    const pins = resolveAgentModelOverrides({ provider: "gemini-cli" }, [
      "openai",
    ]);
    strictEqual(pins.providerOverride, "openai");
  });
});

describe("readAgentModelOverrides", () => {
  it("reads the config and resolves it", async () => {
    const pins = await readAgentModelOverrides("/a", async (path) => {
      strictEqual(path, "/a");
      return { provider: "anthropic", model: "claude-opus-4-8" };
    });
    deepStrictEqual(pins, {
      providerOverride: "anthropic",
      modelOverride: "claude-opus-4-8",
    });
  });

  it("forwards the connected set to the resolver", async () => {
    const pins = await readAgentModelOverrides(
      "/a",
      async () => ({ provider: "anthropic", model: "claude-opus-4-8" }),
      ["openai"],
    );
    strictEqual(pins.providerOverride, "openai");
  });

  it("falls back to no pins when the config read fails", async () => {
    deepStrictEqual(
      await readAgentModelOverrides("/a", async () => {
        throw new Error("boom");
      }),
      {},
    );
  });

  it("falls back to a connected provider when the config read fails", async () => {
    const pins = await readAgentModelOverrides("/a", async () => {
      throw new Error("boom");
    }, ["openai"]);
    strictEqual(pins.providerOverride, "openai");
  });
});
