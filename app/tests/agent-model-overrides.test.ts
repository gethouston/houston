import { deepStrictEqual, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import {
  readAgentModelOverrides,
  resolveAgentModelOverrides,
} from "../src/lib/agent-model-overrides.ts";
import { hydrateProviderCatalog } from "../src/lib/providers.ts";
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
    strictEqual(pins.modelOverride, "claude-opus-4-7");
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

  it("falls back to no pins when the config read fails", async () => {
    deepStrictEqual(
      await readAgentModelOverrides("/a", async () => {
        throw new Error("boom");
      }),
      {},
    );
  });
});
