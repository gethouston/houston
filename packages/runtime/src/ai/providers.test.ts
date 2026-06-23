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

test("github-copilot is a registered OAuth provider with a dotted Copilot model id", () => {
  const ids = PROVIDERS.map((p) => p.id);
  expect(ids).toContain("github-copilot");
  // Subscription OAuth (GitHub device-code flow), not a pasted API key.
  expect(providerAuthMethod("github-copilot")).toBe("oauth");
  // Copilot's gateway uses DOTTED model ids (claude-sonnet-4.6), distinct from
  // the native Anthropic provider's dashed claude-sonnet-4-6 — getModel() throws
  // on the wrong form, so the default must be the dotted Copilot id.
  expect(providerDefaultModel("github-copilot")).toBe("claude-sonnet-4.6");
});
