import { MODEL_DISPLAY, resolveSpokenModel } from "@houston/domain";
import { expect, test } from "vitest";
import { PROVIDERS } from "./catalog";
import { hostProvider, isKnownProvider } from "./lookup";
import { buildProviderCatalog } from "./pi-catalog";

/**
 * The hosted gateway resolves a sleeping agent's mission pin from the pin
 * facts `GET /v1/catalog` carries, so they must say exactly what the host's
 * own resolver (routes/missions-provider.ts) reads.
 */
const catalog = buildProviderCatalog();

test("every catalog provider is one the pin resolver knows, and carries its pin facts", () => {
  for (const provider of catalog) {
    expect(isKnownProvider(provider.id), provider.id).toBe(true);
    expect(provider.pin, provider.id).toBeDefined();
    expect(provider.pin?.name, provider.id).toBe(
      hostProvider(provider.id)?.name,
    );
  }
});

test("curated providers carry the host's display name; others none", () => {
  const codex = catalog.find((p) => p.id === "openai-codex");
  expect(codex?.pin?.name).toBe("ChatGPT / Codex (Plus / Pro)");
  const nvidia = catalog.find((p) => p.id === "nvidia");
  expect(nvidia?.pin).toEqual({ models: [] });
  for (const curated of PROVIDERS) {
    const entry = catalog.find((p) => p.id === curated.id);
    // The local endpoint is curated but has no pi catalog of its own, so no
    // entry carries its name: the hosted gateway lists it under this exact
    // string (cloud internal/edge/agents/missionpin.go localEndpointName).
    if (curated.id === "openai-compatible") {
      expect(entry).toBeUndefined();
      expect(curated.name).toBe("Local model (OpenAI-compatible)");
    } else expect(entry?.pin?.name, curated.id).toBe(curated.name);
  }
});

test("spoken rows are the valid named rows, in the order a family name picks", () => {
  const anthropic = catalog.find((p) => p.id === "anthropic");
  // Retired Claude rows are named but outside the lineup, so they never resolve.
  expect(anthropic?.pin?.models).toEqual([
    { id: "claude-fable-5-2", name: "Fable 5.2" },
    { id: "claude-opus-5-5", name: "Opus 5.5" },
    { id: "claude-sonnet-5-5", name: "Sonnet 5.5" },
    { id: "claude-haiku-5-5", name: "Haiku 5.5" },
  ]);
  const openrouter = catalog.find((p) => p.id === "openrouter");
  expect(openrouter?.pin?.models[0]).toEqual({
    id: "openrouter/free",
    name: "Free (auto-routed)",
  });
});

test("first matching spoken row is what the host resolves, for every named provider", () => {
  for (const provider of Object.keys(MODEL_DISPLAY)) {
    const entry = catalog.find((p) => p.id === provider);
    expect(entry, provider).toBeDefined();
    for (const row of entry?.pin?.models ?? []) {
      expect(resolveSpokenModel(provider, row.name)?.id, row.name).toBe(row.id);
    }
  }
});

test("the curated order a refusal lists is the one the hosted gateway mirrors", () => {
  // cloud internal/pooldispatch/provider.go curatedProviderOrder: the gateway
  // lists a refusal's connected providers in this order.
  expect(PROVIDERS.map((p) => p.id)).toEqual([
    "anthropic",
    "openai-codex",
    "github-copilot",
    "opencode",
    "opencode-go",
    "openrouter",
    "deepseek",
    "google",
    "amazon-bedrock",
    "minimax",
    "openai-compatible",
  ]);
});
