import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  getConnectProviders,
  getVisibleProviders,
} from "../src/lib/providers.ts";

const providerIds = (providers: readonly { id: string }[]): readonly string[] =>
  providers.map((p) => p.id);

describe("provider capability gating", () => {
  it("shows Bedrock when the host advertises Bedrock", () => {
    deepStrictEqual(
      providerIds(
        getVisibleProviders({
          newEngine: true,
          desktop: true,
          capabilities: {
            providers: ["openai-codex", "amazon-bedrock"],
            openaiCompatible: false,
          },
        }),
      ),
      ["openai", "amazon-bedrock"],
    );
  });

  it("hides Bedrock when the host excludes it", () => {
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
      ),
      ["openai"],
    );
  });

  it("hides the local OpenAI-compatible provider when capability disables it", () => {
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

  it("keeps the merged OpenCode connect card only when a gateway is allowed", () => {
    deepStrictEqual(
      providerIds(
        getConnectProviders({
          newEngine: true,
          desktop: true,
          capabilities: {
            providers: ["opencode", "opencode-go"],
            openaiCompatible: false,
          },
        }),
      ),
      ["opencode"],
    );
  });
});
