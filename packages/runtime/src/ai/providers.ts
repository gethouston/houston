import { getModel, getModels } from "@earendil-works/pi-ai";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";
import { authStorage } from "../auth/storage";

/**
 * Supported providers. The provider id is the SAME string pi-ai uses for its
 * model provider, so a stored credential under `id` authenticates
 * `getModel(id, ...)` directly — whether that credential is an OAuth token
 * (Claude / Codex subscriptions) or a pasted API key (OpenCode Zen / Go, which
 * pi exposes as built-in OpenAI-compatible gateways).
 */
export type ProviderId = "anthropic" | "openai-codex" | "opencode" | "opencode-go";

/** How a provider authenticates: a subscription OAuth flow, or a pasted API key. */
export type ProviderAuthMethod = "oauth" | "apiKey";

export const PROVIDERS: {
  id: ProviderId;
  name: string;
  defaultModel: string;
  auth: ProviderAuthMethod;
}[] = [
  { id: "anthropic", name: "Claude (Pro / Max)", defaultModel: config.model, auth: "oauth" },
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    defaultModel: config.codexModel,
    auth: "oauth",
  },
  { id: "opencode", name: "OpenCode Zen", defaultModel: config.opencodeModel, auth: "apiKey" },
  { id: "opencode-go", name: "OpenCode Go", defaultModel: config.opencodeGoModel, auth: "apiKey" },
];

/** A provider's auth method (defaults to OAuth for an unknown id). */
export function providerAuthMethod(id: string): ProviderAuthMethod {
  return PROVIDERS.find((p) => p.id === id)?.auth ?? "oauth";
}

/** A provider's default model id (its catalog default, or the Codex default). */
export function providerDefaultModel(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.defaultModel ?? config.codexModel;
}

const isProvider = (s: string): s is ProviderId => PROVIDERS.some((p) => p.id === s);

type Settings = {
  activeProvider?: ProviderId;
  models?: Partial<Record<ProviderId, string>>;
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
  return PROVIDERS.find((p) => p.id === provider)!.defaultModel;
}

export function modelFor(provider: ProviderId): string {
  return loadSettings().models?.[provider] ?? defaultModel(provider);
}

/** The provider used for new chats: the saved active one if still authed, else the first authed. */
export function activeProvider(): ProviderId | null {
  const saved = loadSettings().activeProvider;
  if (saved && authStorage.hasAuth(saved)) return saved;
  for (const p of PROVIDERS) if (authStorage.hasAuth(p.id)) return p.id;
  return null;
}

export function setSettings(input: {
  activeProvider?: string;
  model?: string;
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
  if (!provider) throw new Error("No provider connected. Connect an AI provider first.");
  return getModel(provider as any, (override || modelFor(provider)) as any);
}

function safeModelIds(provider: ProviderId): string[] {
  try {
    return getModels(provider as any).map((m: any) => m.id);
  } catch {
    return [];
  }
}

export function listProviders() {
  const active = activeProvider();
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    configured: authStorage.hasAuth(p.id),
    isActive: p.id === active,
    activeModel: modelFor(p.id),
    models: safeModelIds(p.id),
  }));
}
