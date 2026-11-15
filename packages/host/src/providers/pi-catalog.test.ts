import type { Api, Model } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import {
  buildProviderCatalog,
  piModelToCatalogEntry,
  piProviderToCatalog,
} from "./pi-catalog";

/**
 * The pure mappers turn pi-ai `Model`s into the `ProviderCatalog` wire shape
 * without touching the live registry. These samples exercise both metadata
 * paths — a reasoning + vision model (full pricing, context, thinking levels)
 * and a text-only non-reasoning model — plus the OAuth vs API-key `auth`
 * derivation on the provider mapper.
 */

// A reasoning + vision model. `thinkingLevelMap` marks "off" unsupported (null)
// and pins xhigh; pi-ai's getSupportedThinkingLevels expands the rest.
const REASONING_VISION: Model<Api> = {
  id: "claude-fable-5",
  name: "Claude Fable 5",
  api: "anthropic-messages",
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  reasoning: true,
  thinkingLevelMap: { off: null, xhigh: "xhigh" },
  input: ["text", "image"],
  cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  contextWindow: 1_000_000,
  maxTokens: 128_000,
};

// A cheap, text-only, non-reasoning model.
const TEXT_ONLY: Model<Api> = {
  id: "gpt-4",
  name: "GPT-4",
  api: "openai-completions",
  provider: "openai",
  baseUrl: "https://api.openai.com",
  reasoning: false,
  input: ["text"],
  cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8_192,
  maxTokens: 4_096,
};

test("maps a reasoning + vision model with full metadata", () => {
  expect(piModelToCatalogEntry(REASONING_VISION)).toEqual({
    id: "claude-fable-5",
    name: "Claude Fable 5",
    pricing: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    reasoning: true,
    vision: true,
    // Derived from getSupportedThinkingLevels: "off" is dropped (marked null).
    thinkingLevels: ["minimal", "low", "medium", "high", "xhigh"],
  });
});

test("maps a text-only, non-reasoning model with no thinking levels", () => {
  const entry = piModelToCatalogEntry(TEXT_ONLY);
  expect(entry).toEqual({
    id: "gpt-4",
    name: "GPT-4",
    pricing: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8_192,
    maxTokens: 4_096,
    reasoning: false,
    vision: false,
  });
  // Non-reasoning models get no effort selector.
  expect(entry.thinkingLevels).toBeUndefined();
});

test("derives auth: oauth for an OAuth provider", () => {
  const provider = piProviderToCatalog(
    "anthropic",
    [REASONING_VISION],
    true,
    "Anthropic (Claude Pro/Max)",
  );
  expect(provider.auth).toBe("oauth");
  expect(provider.name).toBe("Anthropic (Claude Pro/Max)");
  expect(provider.models).toHaveLength(1);
  expect(provider.models[0]?.id).toBe("claude-fable-5");
});

test("derives auth: apiKey for a non-OAuth provider", () => {
  const provider = piProviderToCatalog("openai", [TEXT_ONLY], false, "Openai");
  expect(provider).toEqual({
    id: "openai",
    name: "Openai",
    auth: "apiKey",
    models: [piModelToCatalogEntry(TEXT_ONLY)],
  });
});

/**
 * The built catalog is the FULL pi-ai registry on every deployment — no profile
 * gating. This is the guard for the "hosted users see every provider" product
 * decision: OAuth subscriptions AND the API-key providers must all be present,
 * each with a non-empty, wire-shaped model list.
 */
test("buildProviderCatalog serves the full pi-ai registry", () => {
  const catalog = buildProviderCatalog();
  expect(catalog.length).toBeGreaterThanOrEqual(30);

  const ids = new Set(catalog.map((p) => p.id));
  for (const required of [
    "anthropic",
    "openai-codex",
    "github-copilot",
    "opencode",
    "opencode-go",
    "openrouter",
    "google",
    "deepseek",
  ]) {
    expect(ids.has(required)).toBe(true);
  }

  const oauth = catalog.filter((p) => p.auth === "oauth").map((p) => p.id);
  expect(new Set(oauth)).toEqual(
    new Set(["anthropic", "github-copilot", "openai-codex"]),
  );

  for (const provider of catalog) {
    expect(provider.models.length).toBeGreaterThan(0);
    for (const model of provider.models) {
      expect(model.id.length).toBeGreaterThan(0);
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
      if (model.reasoning) {
        expect((model.thinkingLevels ?? []).length).toBeGreaterThan(0);
      }
    }
  }
});

test("catalog offers MiniMax only ids its API serves", () => {
  // `MiniMax-M3[1m]` is Claude Code's client-side 1M marker; MiniMax answers
  // it with `unknown model` (2013), and MiniMax retired the M2.7 line. Every
  // row without `runsAs` is one a turn runs as itself.
  const minimax = buildProviderCatalog().find((p) => p.id === "minimax");
  const served = (minimax?.models ?? [])
    .filter((m) => m.runsAs === undefined)
    .map((m) => m.id)
    .sort();
  expect(served).toEqual(["MiniMax-M3", "MiniMax-M3.1-Flash"]);
});

test("MiniMax's retired ids stay as rows that run as M3.1 Flash", () => {
  // A team ceiling written with a retired id keeps admitting MiniMax: the
  // gateway's clamp and the app map the entry through `runsAs`.
  const minimax = buildProviderCatalog().find((p) => p.id === "minimax");
  const runsAs = Object.fromEntries(
    (minimax?.models ?? [])
      .filter((m) => m.runsAs !== undefined)
      .map((m) => [m.id, m.runsAs]),
  );
  expect(runsAs).toEqual({
    "MiniMax-M3[1m]": "MiniMax-M3.1-Flash",
    "MiniMax-M2.7": "MiniMax-M3.1-Flash",
    "MiniMax-M2.7-highspeed": "MiniMax-M3.1-Flash",
  });
});
