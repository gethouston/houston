import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import { expect, test } from "vitest";
import { HoustonAuthStore } from "../auth/credential-store";
import { config } from "../config";
import {
  buildOpenAiCompatibleModel,
  localOverrideError,
  OPENAI_COMPATIBLE,
  registerCustomProviderIfConfigured,
  setCustomEndpointConfig,
} from "./openai-compatible";
import { ModelNotOfferedError } from "./provider-error";
import {
  isProvider,
  PROVIDERS,
  pickActiveProvider,
  pickClaimedProvider,
  providerAuthMethod,
  providerDefaultModel,
  resolveModel,
  safeGetModel,
  safeModelIds,
} from "./providers";

test("api-key providers are registered as api-key providers", () => {
  const ids = PROVIDERS.map((p) => p.id);
  expect(ids).toContain("opencode");
  expect(ids).toContain("opencode-go");
  expect(ids).toContain("deepseek");
  expect(ids).toContain("amazon-bedrock");
  expect(ids).toContain("minimax");

  expect(providerAuthMethod("opencode")).toBe("apiKey");
  expect(providerAuthMethod("opencode-go")).toBe("apiKey");
  expect(providerAuthMethod("deepseek")).toBe("apiKey");
  expect(providerAuthMethod("amazon-bedrock")).toBe("apiKey");
  expect(providerAuthMethod("minimax")).toBe("apiKey");
  expect(providerAuthMethod("anthropic")).toBe("oauth");
  expect(providerAuthMethod("openai-codex")).toBe("oauth");
  expect(providerAuthMethod("nope")).toBe("oauth");
});

test("an uncurated pi provider (groq) is accepted, api-key, and defaults to its first pi model", () => {
  expect(PROVIDERS.map((p) => p.id)).not.toContain("groq");
  expect(isProvider("groq")).toBe(true);
  expect(providerAuthMethod("groq")).toBe("apiKey");
  expect(providerDefaultModel("groq")).toBe("llama-3.1-8b-instant");
  const m = safeGetModel("groq", providerDefaultModel("groq"), false) as {
    provider?: string;
    id?: string;
  };
  expect(m.provider).toBe("groq");
  expect(m.id).toBe("llama-3.1-8b-instant");
});

test("an OAuth pi provider stays OAuth, and a non-pi id is rejected", () => {
  expect(providerAuthMethod("openai-codex")).toBe("oauth");
  expect(isProvider("not-a-real-provider")).toBe(false);
  expect(providerAuthMethod("not-a-real-provider")).toBe("oauth");
});

test("providerDefaultModel returns each provider's catalog default", () => {
  expect(providerDefaultModel("opencode")).toBe("claude-sonnet-4-6");
  expect(providerDefaultModel("opencode-go")).toBe("glm-5.3");
  expect(providerDefaultModel("deepseek")).toBe("deepseek-flash");
  expect(providerDefaultModel("amazon-bedrock")).toBe(
    "global.anthropic.claude-sonnet-4-6",
  );
  expect(providerDefaultModel("minimax")).toBe("MiniMax-M3.1-Flash");
});

test("a provider with no catalog default resolves to NO model, never Codex's", () => {
  expect(providerDefaultModel("nope")).toBe("");
  expect(providerDefaultModel("nope")).not.toBe(config.codexModel);
  expect(providerDefaultModel("nope")).not.toBe(DEFAULT_MODEL["openai-codex"]);
  expect(typeof providerDefaultModel("nope")).toBe("string");
});

test("uncurated providers with a hand-picked default skip pi's dead first row (PRODUCT-1411)", () => {
  expect(providerDefaultModel("moonshotai")).toBe("kimi-k3");
  const m = safeGetModel(
    "moonshotai",
    providerDefaultModel("moonshotai"),
    false,
  ) as { provider?: string; id?: string };
  expect(m.provider).toBe("moonshotai");
  expect(m.id).toBe("kimi-k3");
  expect(providerDefaultModel("nvidia")).toBe("minimaxai/minimax-m3.1-flash");
});

test("MiniMax uses pi-ai's global minimax provider and model catalog", () => {
  const ids = PROVIDERS.map((p) => p.id);
  expect(ids).toContain("minimax");
  expect(ids).not.toContain("minimax-cn");

  expect(
    (safeGetModel("minimax", "MiniMax-M3", false) as { provider?: string })
      .provider,
  ).toBe("minimax");
  expect(
    (safeGetModel("minimax", "MiniMax-M3", false) as { id?: string }).id,
  ).toBe("MiniMax-M3");
});

test("MiniMax runs only ids its API serves; a stored MiniMax-M3[1m] retargets to the default", () => {
  expect(providerDefaultModel("minimax")).toBe("MiniMax-M3.1-Flash");
  for (const pinned of [false, true]) {
    const m = safeGetModel("minimax", "MiniMax-M3[1m]", pinned) as {
      id?: string;
      provider?: string;
      baseUrl?: string;
    };
    expect(m.id).toBe("MiniMax-M3.1-Flash");
    expect(m.provider).toBe("minimax");
    expect(m.baseUrl).toBe("https://api.minimax.io/anthropic");
  }
  expect(safeModelIds("minimax")).not.toContain("MiniMax-M3[1m]");
});

test("a pinned or saved MiniMax-M2.7 runs on M3.1 Flash", () => {
  for (const retired of ["MiniMax-M2.7", "MiniMax-M2.7-highspeed"]) {
    for (const pinned of [false, true]) {
      const m = safeGetModel("minimax", retired, pinned) as { id?: string };
      expect(m.id).toBe("MiniMax-M3.1-Flash");
    }
    expect(safeModelIds("minimax")).not.toContain(retired);
  }
  expect(safeModelIds("minimax")).toEqual(
    expect.arrayContaining(["MiniMax-M3.1-Flash", "MiniMax-M3"]),
  );
});

test("safeGetModel keeps a valid saved id but falls back on a stale one", () => {
  expect(
    (safeGetModel("anthropic", "claude-opus-5-5", false) as { id?: string }).id,
  ).toBe("claude-opus-5-5");
  expect(
    (safeGetModel("anthropic", "claude-2.1", false) as { id?: string }).id,
  ).toBe(providerDefaultModel("anthropic"));
  expect(() => safeGetModel("anthropic", "claude-2.1", true)).toThrow(
    'anthropic model "claude-2.1" is not available',
  );
  let thrown: unknown;
  try {
    safeGetModel("anthropic", "anthropic/claude-opus-5", true);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(ModelNotOfferedError);
  expect((thrown as ModelNotOfferedError).providerError).toEqual({
    kind: "model_unavailable",
    provider: "anthropic",
    model: "anthropic/claude-opus-5",
    reason: "unknown",
    suggested_fallback: providerDefaultModel("anthropic"),
    message: 'anthropic model "anthropic/claude-opus-5" is not available',
  });
});

test("resolveModel honors a pinned provider regardless of the active one (never auth-gated)", () => {
  const m = resolveModel("claude-opus-5-5", "anthropic") as {
    provider?: string;
    id?: string;
  };
  expect(m.provider).toBe("anthropic");
  expect(m.id).toBe("claude-opus-5-5");
});

test("resolveModel canonicalizes a wire `openai` pin to the openai-codex product", () => {
  const m = resolveModel(undefined, "openai") as { provider?: string };
  expect(m.provider).toBe("openai-codex");
});

test("resolveModel throws a readable error for an unknown pinned provider", () => {
  expect(() => resolveModel(undefined, "gemini-cli")).toThrow(
    "unknown provider: gemini-cli",
  );
});

test("pickActiveProvider keeps a logged-out saved provider sticky (no silent switch)", () => {
  expect(pickActiveProvider("openai-codex", ["openrouter"])).toBeNull();
  expect(pickActiveProvider("anthropic", [])).toBeNull();
});

test("pickActiveProvider uses the saved provider when it is connected", () => {
  expect(
    pickActiveProvider("openai-codex", ["openai-codex", "openrouter"]),
  ).toBe("openai-codex");
});

test("pickClaimedProvider never moves a saved provider (HOU-695)", () => {
  expect(
    pickClaimedProvider(
      "openai-codex",
      ["openai-codex", "opencode", "opencode-go"],
      "opencode",
      ["opencode", "opencode-go"],
    ),
  ).toBeNull();
  expect(
    pickClaimedProvider(
      "openai-codex",
      ["opencode", "opencode-go"],
      "opencode",
      ["opencode", "opencode-go"],
    ),
  ).toBeNull();
});

test("pickClaimedProvider pins the already-serving fallback, not the newcomer", () => {
  expect(
    pickClaimedProvider(
      undefined,
      ["anthropic", "opencode", "opencode-go"],
      "opencode",
      ["opencode", "opencode-go"],
    ),
  ).toBe("anthropic");
  expect(
    pickClaimedProvider(
      undefined,
      ["anthropic", "opencode", "opencode-go"],
      "anthropic",
      ["anthropic"],
    ),
  ).toBe("opencode");
});

test("pickClaimedProvider claims for a first connect on a fresh agent", () => {
  expect(
    pickClaimedProvider(undefined, ["opencode", "opencode-go"], "opencode", [
      "opencode",
      "opencode-go",
    ]),
  ).toBe("opencode");
  expect(pickClaimedProvider(undefined, ["google"], "google", ["google"])).toBe(
    "google",
  );
});

test("pickActiveProvider falls back to the first connected ONLY when nothing is saved", () => {
  expect(pickActiveProvider(undefined, ["openrouter", "google"])).toBe(
    "openrouter",
  );
  expect(pickActiveProvider(undefined, [])).toBeNull();
});

test("github-copilot is a registered OAuth provider defaulting to a base model (HOU-578)", () => {
  const ids = PROVIDERS.map((p) => p.id);
  expect(ids).toContain("github-copilot");
  expect(providerAuthMethod("github-copilot")).toBe("oauth");
  expect(providerDefaultModel("github-copilot")).toBe("gpt-6-luna");
});

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
  expect(m.name).toBe("llama3.1");
  expect(m.baseUrl).toBe("http://localhost:11434/v1");
  expect(m.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
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
  expect(m.compat?.supportsReasoningEffort).toBe(true);
});

test("the built local model's provider matches the auth-store key, so pi resolves its key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "houston-oac-"));
  const authStorage = new HoustonAuthStore(join(dir, "auth.json"));
  const runtime = await ModelRuntime.create({
    credentials: authStorage,
    modelsPath: join(dir, "models.json"),
  });
  runtime.registerProvider(OPENAI_COMPATIBLE, {
    name: "Local model (OpenAI-compatible)",
    baseUrl: "http://localhost:11434/v1",
    api: "openai-completions",
    models: [],
  });
  authStorage.set(OPENAI_COMPATIBLE, {
    type: "api_key",
    key: "houston-local",
  });
  const model = buildOpenAiCompatibleModel({
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
  });
  const auth = await runtime.getAuth(model);
  expect(auth?.auth.apiKey).toBe("houston-local");
});

test("registerCustomProviderIfConfigured mirrors the endpoint config onto a runtime", () => {
  const registered = new Map<string, unknown>();
  const runtime = {
    registerProvider: (id: string, cfg: unknown) => registered.set(id, cfg),
    unregisterProvider: (id: string) => registered.delete(id),
    getRegisteredProviderConfig: (id: string) => registered.get(id),
  };
  const dir = mkdtempSync(join(tmpdir(), "houston-oac-reg-"));
  registerCustomProviderIfConfigured(runtime as never, dir);
  expect(registered.has(OPENAI_COMPATIBLE)).toBe(false);
});

test("localOverrideError refuses a foreign per-turn model on the local endpoint", () => {
  expect(localOverrideError("qwen2.5", undefined)).toBeNull();
  expect(localOverrideError("qwen2.5", "qwen2.5")).toBeNull();
  expect(localOverrideError("qwen2.5", "claude-haiku-4.5")).toMatch(
    /local endpoint serves/,
  );
});

test("setCustomEndpointConfig rejects bad input before persisting", () => {
  expect(() => setCustomEndpointConfig({ baseUrl: "", model: "m" })).toThrow(
    /base URL/,
  );
  expect(() =>
    setCustomEndpointConfig({ baseUrl: "http://x/v1", model: "" }),
  ).toThrow(/model/);
  expect(() =>
    setCustomEndpointConfig({ baseUrl: "not a url", model: "m" }),
  ).toThrow(/valid URL/);
  expect(() =>
    setCustomEndpointConfig({ baseUrl: "ftp://localhost/v1", model: "m" }),
  ).toThrow(/http/);
});
