import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Api,
  getModel,
  getModels,
  type KnownProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { authStorage, providerConnected } from "../auth/storage";
import { config } from "../config";

/**
 * Supported providers. The provider id is the SAME string pi-ai uses for its
 * model provider, so a stored credential under `id` authenticates
 * `getModel(id, ...)` directly — whether that credential is an OAuth token
 * (Claude / Codex subscriptions) or a pasted API key (OpenCode Zen / Go, which
 * pi exposes as built-in OpenAI-compatible gateways).
 */
export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "opencode"
  | "opencode-go"
  | "openrouter"
  | "google";

/** How a provider authenticates: a subscription OAuth flow, or a pasted API key. */
export type ProviderAuthMethod = "oauth" | "apiKey";

export const PROVIDERS: {
  id: ProviderId;
  name: string;
  defaultModel: string;
  auth: ProviderAuthMethod;
}[] = [
  {
    id: "anthropic",
    name: "Claude (Pro / Max)",
    defaultModel: config.model,
    auth: "oauth",
  },
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    defaultModel: config.codexModel,
    auth: "oauth",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    defaultModel: config.githubCopilotModel,
    auth: "oauth",
  },
  {
    id: "opencode",
    name: "OpenCode Zen",
    defaultModel: config.opencodeModel,
    auth: "apiKey",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    defaultModel: config.opencodeGoModel,
    auth: "apiKey",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: config.openrouterModel,
    auth: "apiKey",
  },
  {
    id: "google",
    name: "Google Gemini",
    defaultModel: config.geminiModel,
    auth: "apiKey",
  },
];

/** A provider's auth method (defaults to OAuth for an unknown id). */
export function providerAuthMethod(id: string): ProviderAuthMethod {
  return PROVIDERS.find((p) => p.id === id)?.auth ?? "oauth";
}

/** A provider's default model id (its catalog default, or the Codex default). */
export function providerDefaultModel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.defaultModel ?? config.codexModel;
}

const isProvider = (s: string): s is ProviderId =>
  PROVIDERS.some((p) => p.id === s);

type Settings = {
  activeProvider?: ProviderId;
  models?: Partial<Record<ProviderId, string>>;
  /** Reasoning effort applied to each turn (mapped to pi's thinking level). */
  effort?: string;
};

const settingsFile = join(config.dataDir, "settings.json");

function loadSettings(): Settings {
  if (!existsSync(settingsFile)) return {};
  try {
    return JSON.parse(readFileSync(settingsFile, "utf8")) as Settings;
  } catch {
    return {};
  }
}

function saveSettings(s: Settings) {
  const tmp = `${settingsFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, settingsFile);
}

function defaultModel(provider: ProviderId): string {
  const found = PROVIDERS.find((p) => p.id === provider);
  if (!found) throw new Error(`unknown provider: ${provider}`);
  return found.defaultModel;
}

export function modelFor(provider: ProviderId): string {
  return loadSettings().models?.[provider] ?? defaultModel(provider);
}

/** The agent's saved reasoning effort for new turns, or null (model default). */
export function activeEffort(): string | null {
  return loadSettings().effort ?? null;
}

/**
 * Pure provider-selection policy (the IO wrapper is `activeProvider`).
 *
 * A SAVED provider is sticky: use it when connected, and return `null` when it
 * is logged out — NEVER another connected provider. Silently switching an agent
 * that is configured for one provider onto a different connected one (e.g.
 * answering an OpenAI chat with OpenRouter after the OpenAI logout) bills and
 * answers under a model the user never chose; the logged-out provider must
 * instead surface the reconnect card. The "first connected" fallback applies
 * ONLY when nothing is saved yet (a fresh agent's very first chat) so an initial
 * turn can start without a manual pick (#483).
 *
 * @param authedIds connected providers, in registry order.
 */
export function pickActiveProvider(
  saved: ProviderId | undefined,
  authedIds: ProviderId[],
): ProviderId | null {
  if (saved) return authedIds.includes(saved) ? saved : null;
  return authedIds[0] ?? null;
}

/**
 * The provider this agent's turns run on: the saved pick when connected, else —
 * only when nothing is saved — the first connected provider. `null` => no
 * provider connected for the saved pick, so the turn must surface the reconnect
 * card rather than silently switching.
 */
export function activeProvider(): ProviderId | null {
  const authed = PROVIDERS.filter((p) =>
    providerConnected(authStorage, p.id),
  ).map((p) => p.id);
  return pickActiveProvider(loadSettings().activeProvider, authed);
}

export function setSettings(input: {
  activeProvider?: string;
  model?: string;
  effort?: string;
}): Settings {
  const s = loadSettings();
  if (input.activeProvider) {
    if (!isProvider(input.activeProvider))
      throw new Error(`unknown provider: ${input.activeProvider}`);
    s.activeProvider = input.activeProvider;
  }
  if (input.model) {
    const prov = (input.activeProvider as ProviderId) ?? s.activeProvider;
    if (!prov) throw new Error("set a provider before choosing a model");
    s.models = { ...s.models, [prov]: input.model };
  }
  if (input.effort) s.effort = input.effort;
  saveSettings(s);
  return s;
}

/**
 * Resolve the pi-ai model for the active provider (used when starting a turn).
 * An optional `override` (a routine's pinned model) wins over the saved model;
 * `getModel` throws for an id the provider doesn't offer, so a bad pin surfaces
 * as the turn's error rather than silently falling back.
 */
export function resolveModel(override?: string | null) {
  const provider = activeProvider();
  if (!provider)
    throw new Error("No provider connected. Connect an AI provider first.");
  // ProviderId is a subset of KnownProvider; modelId is a runtime string the
  // caller controls. Cast to getModel's declared model-id param type. getModel
  // throws at runtime if the id is not offered by the provider.
  return getModel(
    provider as KnownProvider,
    (override || modelFor(provider)) as Parameters<typeof getModel>[1],
  );
}

function safeModelIds(provider: ProviderId): string[] {
  try {
    return getModels(provider as KnownProvider).map((m: Model<Api>) => m.id);
  } catch {
    return [];
  }
}

export function listProviders() {
  const active = activeProvider();
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    configured: providerConnected(authStorage, p.id),
    isActive: p.id === active,
    activeModel: modelFor(p.id),
    models: safeModelIds(p.id),
  }));
}
