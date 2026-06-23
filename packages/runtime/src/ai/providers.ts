import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Api,
  getModel,
  getModels,
  type KnownProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { authStorage } from "../auth/storage";
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
  | "opencode"
  | "opencode-go";

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
 * getModel for a provider+model, but read-time-safe against a LEGACY/stale id.
 *
 * A bare `getModel(provider, id)` THROWS for an id the provider doesn't offer.
 * The desktop's stored config could carry a legacy id (the migration runs on
 * the write/seed path — see packages/domain migrateProviderModel — but a
 * settings.json written before that fix, or hand-edited, can still hold one).
 * Rather than hard-fail the turn, fall back to the provider's catalog default
 * and emit a diagnostic (beta no-silent-failure: the user still gets a turn AND
 * the swap is logged for the bug tail). A pinned `override` (routine model) is
 * the one exception kept verbatim — a bad pin SHOULD surface as the turn error.
 */
export function safeGetModel(
  provider: string,
  modelId: string,
  pinned: boolean,
) {
  const pp = provider as KnownProvider;
  const mp = modelId as Parameters<typeof getModel>[1];
  if (pinned) return getModel(pp, mp);
  const offered = safeModelIds(provider as ProviderId);
  // Open-catalog gateways (opencode/opencode-go) return [] from getModels but
  // accept arbitrary ids — only guard when we actually have a catalog to check.
  if (offered.length > 0 && !offered.includes(modelId)) {
    const fallback = providerDefaultModel(provider);
    console.warn(
      `[providers] ${provider} model "${modelId}" is not offered; ` +
        `falling back to "${fallback}"`,
    );
    return getModel(pp, fallback as Parameters<typeof getModel>[1]);
  }
  return getModel(pp, mp);
}

/**
 * Resolve the pi-ai model for the active provider (used when starting a turn).
 * An optional `override` (a routine's pinned model) wins over the saved model;
 * a bad pin surfaces as the turn's error, while a stale SAVED id falls back to
 * the provider default (see safeGetModel) rather than hard-failing the turn.
 */
export function resolveModel(override?: string | null) {
  const provider = activeProvider();
  if (!provider)
    throw new Error("No provider connected. Connect an AI provider first.");
  return safeGetModel(provider, override || modelFor(provider), !!override);
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
    configured: authStorage.hasAuth(p.id),
    isActive: p.id === active,
    activeModel: modelFor(p.id),
    models: safeModelIds(p.id),
  }));
}
