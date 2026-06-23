import { expect, test } from "bun:test";
import {
  PROVIDERS,
  providerAuthMethod,
  providerDefaultModel,
} from "./providers";

/**
 * OpenCode Zen / Go are pi-native OpenAI-compatible gateways authenticated by a
 * pasted API key (no OAuth). The registry must mark them as such so the auth
 * routes route a paste-a-key submission instead of an OAuth login, and so the
 * cloud per-turn fallback resolves the right default model per provider.
 */

test("opencode + opencode-go are registered as api-key providers", () => {
  const ids = PROVIDERS.map((p) => p.id);
  expect(ids).toContain("opencode");
  expect(ids).toContain("opencode-go");

  expect(providerAuthMethod("opencode")).toBe("apiKey");
  expect(providerAuthMethod("opencode-go")).toBe("apiKey");
  expect(providerAuthMethod("anthropic")).toBe("oauth");
  expect(providerAuthMethod("openai-codex")).toBe("oauth");
  // Unknown providers default to OAuth.
  expect(providerAuthMethod("nope")).toBe("oauth");
});

test("providerDefaultModel returns each provider's catalog default", () => {
  expect(providerDefaultModel("opencode")).toBe("claude-sonnet-4-6");
  expect(providerDefaultModel("opencode-go")).toBe("glm-5.1");
  // Unknown falls back to the Codex default (never throws / undefined).
  expect(providerDefaultModel("nope")).toBe("gpt-5.5");
});
