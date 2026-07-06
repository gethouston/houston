import { deepStrictEqual, ok } from "node:assert";
import { before, describe, it } from "node:test";
import {
  getConnectProviders,
  getVisibleProviders,
  hydrateProviderCatalog,
} from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

// `/v1/catalog` is the single visibility source: `PROVIDERS` is hydrated from it,
// so it already IS the deployment's runnable set. Populate the cache first, then
// assert the helpers no longer re-gate by `capabilities.providers` — only the
// local OpenAI-compatible provider (via `openaiCompatible`) and coming-soon are
// held back.
before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

const providerIds = (providers: readonly { id: string }[]): readonly string[] =>
  providers.map((p) => p.id);

describe("provider capability gating", () => {
  it("shows every catalog provider regardless of capabilities.providers", () => {
    // A narrow capabilities.providers list used to hide everything absent from
    // it; now the hydrated catalog decides, so all first-class providers show.
    const visible = providerIds(
      getVisibleProviders({
        newEngine: true,
        desktop: true,
        capabilities: {
          providers: ["openai-codex"],
          openaiCompatible: false,
        },
      }),
    );
    for (const id of [
      "openai",
      "anthropic",
      "amazon-bedrock",
      "openrouter",
      "google",
    ]) {
      ok(
        visible.includes(id),
        `${id} shows despite the narrow capability list`,
      );
    }
  });

  it("hides the local OpenAI-compatible provider when the capability disables it", () => {
    deepStrictEqual(
      providerIds(
        getVisibleProviders({
          newEngine: true,
          desktop: true,
          capabilities: {
            providers: ["openai-codex"],
            openaiCompatible: false,
          },
        }),
      ).includes("openai-compatible"),
      false,
    );
  });

  it("shows the local OpenAI-compatible provider when the capability enables it", () => {
    deepStrictEqual(
      providerIds(
        getVisibleProviders({
          newEngine: true,
          desktop: true,
          capabilities: {
            providers: [],
            openaiCompatible: true,
          },
        }),
      ).includes("openai-compatible"),
      true,
    );
  });

  it("merges the two OpenCode gateways into one connect card, catalog-gated only", () => {
    const connect = providerIds(
      getConnectProviders({
        newEngine: true,
        desktop: true,
        capabilities: {
          providers: ["opencode"],
          openaiCompatible: false,
        },
      }),
    );
    // Exactly one OpenCode card, standing for both gateways; opencode-go folded in.
    deepStrictEqual(
      connect.filter((id) => id === "opencode" || id === "opencode-go"),
      ["opencode"],
    );
    // Other providers still show even though only `opencode` was advertised.
    ok(connect.includes("anthropic"));
    ok(connect.includes("openai"));
  });
});
