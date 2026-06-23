import { expect, test } from "bun:test";
import {
  PROVIDERS,
  pickActiveProvider,
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

test("pickActiveProvider keeps a logged-out saved provider sticky (no silent switch)", () => {
  // THE BUG: an OpenAI-configured agent whose OpenAI logged out must NOT fall
  // through to a still-connected provider (OpenRouter) and answer there — it
  // returns null so the turn fails with "No provider connected" (→ reconnect
  // card) instead of silently billing/answering under a model never chosen.
  expect(pickActiveProvider("openai-codex", ["openrouter"])).toBeNull();
  // Saved provider, nothing connected at all → also null.
  expect(pickActiveProvider("anthropic", [])).toBeNull();
});

test("pickActiveProvider uses the saved provider when it is connected", () => {
  expect(
    pickActiveProvider("openai-codex", ["openai-codex", "openrouter"]),
  ).toBe("openai-codex");
});

test("pickActiveProvider falls back to the first connected ONLY when nothing is saved", () => {
  // A fresh agent (no saved pick) may start its first chat on a connected
  // provider; once a provider is saved, the case above keeps it sticky.
  expect(pickActiveProvider(undefined, ["openrouter", "google"])).toBe(
    "openrouter",
  );
  expect(pickActiveProvider(undefined, [])).toBeNull();
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
