import { expect, test } from "bun:test";
import {
  PROVIDERS,
  providerAuthMethod,
  providerDefaultModel,
  safeGetModel,
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

test("safeGetModel keeps a valid saved id but falls back on a stale one", () => {
  // A valid id resolves to that exact model.
  expect(
    (safeGetModel("anthropic", "claude-opus-4-8", false) as { id?: string }).id,
  ).toBe("claude-opus-4-8");
  // A stale/legacy id the provider no longer offers falls back to the default
  // so the turn runs a REAL model. (pi-ai's getModel returns `undefined` for an
  // unknown id — which would crash the turn downstream — so the guard catches
  // it against the live catalog and substitutes the provider default.)
  expect(
    (safeGetModel("anthropic", "claude-2.1", false) as { id?: string }).id,
  ).toBe(providerDefaultModel("anthropic"));
  // A PINNED id (a routine's model) is NOT auto-corrected — it passes through
  // verbatim so a deliberately bad pin surfaces as the turn's own error rather
  // than being silently swapped for a different model.
  expect(safeGetModel("anthropic", "claude-2.1", true)).toBeUndefined();
});
