import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { bedrockOptionsWithBearerToken } from "./bedrock";
import {
  buildOpenAiCompatibleModel,
  localOverrideError,
  OPENAI_COMPATIBLE,
  setCustomEndpointConfig,
} from "./openai-compatible";
import {
  PROVIDERS,
  pickActiveProvider,
  providerAuthMethod,
  providerDefaultModel,
} from "./providers";

/**
 * OpenCode Zen / Go and Amazon Bedrock are pi-native providers authenticated by
 * pasted keys (no OAuth). The registry must mark them as such so the auth
 * routes route a paste-a-key submission instead of an OAuth login, and so the
 * cloud per-turn fallback resolves the right default model per provider.
 */

test("opencode, opencode-go, and amazon-bedrock are registered as api-key providers", () => {
  const ids = PROVIDERS.map((p) => p.id);
  expect(ids).toContain("opencode");
  expect(ids).toContain("opencode-go");
  expect(ids).toContain("amazon-bedrock");

  expect(providerAuthMethod("opencode")).toBe("apiKey");
  expect(providerAuthMethod("opencode-go")).toBe("apiKey");
  expect(providerAuthMethod("amazon-bedrock")).toBe("apiKey");
  expect(providerAuthMethod("anthropic")).toBe("oauth");
  expect(providerAuthMethod("openai-codex")).toBe("oauth");
  // Unknown providers default to OAuth.
  expect(providerAuthMethod("nope")).toBe("oauth");
});

test("providerDefaultModel returns each provider's catalog default", () => {
  expect(providerDefaultModel("opencode")).toBe("claude-sonnet-4-6");
  expect(providerDefaultModel("opencode-go")).toBe("glm-5.1");
  expect(providerDefaultModel("amazon-bedrock")).toBe(
    "anthropic.claude-sonnet-4-6",
  );
  // Unknown falls back to the Codex default (never throws / undefined).
  expect(providerDefaultModel("nope")).toBe("gpt-5.5");
});

test("bedrockOptionsWithBearerToken maps Houston's stored key to Bedrock bearer auth", () => {
  expect(bedrockOptionsWithBearerToken(undefined)).toBeUndefined();
  expect(bedrockOptionsWithBearerToken({ apiKey: "br_test" })).toEqual({
    apiKey: "br_test",
    bearerToken: "br_test",
  });
  expect(
    bedrockOptionsWithBearerToken({ apiKey: "stored", bearerToken: "direct" }),
  ).toEqual({ apiKey: "stored", bearerToken: "direct" });
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

/**
 * The OpenAI-compatible provider connects to a user-run local server (Ollama /
 * vLLM / LM Studio) by base URL + model id — neither in any pi catalog — so it
 * uses its own `openaiCompatible` auth method and a hand-built pi-ai model.
 */
test("openai-compatible is registered with the openaiCompatible auth method", () => {
  expect(PROVIDERS.map((p) => p.id)).toContain("openai-compatible");
  expect(providerAuthMethod("openai-compatible")).toBe("openaiCompatible");
});

test("buildOpenAiCompatibleModel maps an endpoint to a pi openai-completions model", () => {
  const m = buildOpenAiCompatibleModel({
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
  });
  expect(m.provider).toBe("openai-compatible");
  expect(m.api).toBe("openai-completions");
  expect(m.id).toBe("llama3.1");
  // Name defaults to the model id when none is given.
  expect(m.name).toBe("llama3.1");
  expect(m.baseUrl).toBe("http://localhost:11434/v1");
  // Local inference is free.
  expect(m.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  // Reasoning + its compat flag are off by default (most local chat models).
  expect(m.reasoning).toBe(false);
  expect(m.compat?.supportsReasoningEffort).toBe(false);
  expect(m.compat?.supportsDeveloperRole).toBe(false);
});

test("buildOpenAiCompatibleModel honors name, contextWindow, and reasoning", () => {
  const m = buildOpenAiCompatibleModel({
    baseUrl: "http://localhost:1234/v1",
    model: "qwen2.5-coder",
    name: "Qwen Coder",
    contextWindow: 65_536,
    reasoning: true,
  });
  expect(m.name).toBe("Qwen Coder");
  expect(m.contextWindow).toBe(65_536);
  expect(m.reasoning).toBe(true);
  // A reasoning model opts back into reasoning_effort.
  expect(m.compat?.supportsReasoningEffort).toBe(true);
});

test("the built local model's provider matches the auth-store key, so pi resolves its key", async () => {
  // The whole keyless-server design rests on a string match: setCustomEndpoint
  // stores the key under OPENAI_COMPATIBLE, and the hand-built model carries
  // provider=OPENAI_COMPATIBLE. pi resolves a request's key via
  // ModelRegistry.getApiKeyAndHeaders -> authStorage.getApiKey(model.provider).
  // Drive that exact path with an isolated AuthStorage/ModelRegistry (no shared
  // singleton, no real ~/.houston) to prove the placeholder key actually resolves.
  const dir = mkdtempSync(join(tmpdir(), "houston-oac-"));
  const authStorage = AuthStorage.create(join(dir, "auth.json"));
  const registry = ModelRegistry.create(authStorage, join(dir, "models.json"));
  authStorage.set(OPENAI_COMPATIBLE, {
    type: "api_key",
    key: "houston-local",
  });
  const model = buildOpenAiCompatibleModel({
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
  });
  const auth = await registry.getApiKeyAndHeaders(model);
  expect(auth.ok).toBe(true);
  if (auth.ok) expect(auth.apiKey).toBe("houston-local");
});

test("localOverrideError refuses a foreign per-turn model on the local endpoint", () => {
  // No override, or an override matching the configured local model → allowed.
  expect(localOverrideError("qwen2.5", undefined)).toBeNull();
  expect(localOverrideError("qwen2.5", "qwen2.5")).toBeNull();
  // A different provider's model id (e.g. a routine pin) must NOT be built
  // against the local base URL — surface it instead of mis-routing to localhost.
  expect(localOverrideError("qwen2.5", "claude-haiku-4.5")).toMatch(
    /local endpoint serves/,
  );
});

test("setCustomEndpointConfig rejects bad input before persisting", () => {
  // Missing pieces throw before any file is written.
  expect(() => setCustomEndpointConfig({ baseUrl: "", model: "m" })).toThrow(
    /base URL/,
  );
  expect(() =>
    setCustomEndpointConfig({ baseUrl: "http://x/v1", model: "" }),
  ).toThrow(/model/);
  // Not a URL.
  expect(() =>
    setCustomEndpointConfig({ baseUrl: "not a url", model: "m" }),
  ).toThrow(/valid URL/);
  // Wrong scheme (must be http(s) so a typo doesn't reach the agent loop).
  expect(() =>
    setCustomEndpointConfig({ baseUrl: "ftp://localhost/v1", model: "m" }),
  ).toThrow(/http/);
});
