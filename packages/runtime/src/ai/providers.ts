import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { type BuiltinProvider, getModel } from "@earendil-works/pi-ai/compat";
import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import { toCanonicalProviderId } from "@houston/domain/provider-dialect";
import type { ProviderHealth } from "@houston/protocol";
import { atomicTempPath } from "@houston/protocol";
import {
  authFailureActive,
  quotaExhaustedActive,
} from "../auth/credential-health";
import { servedScopeFor } from "../auth/served-scope";
import { authStorage, providerConnected } from "../auth/storage";
import { config } from "../config";
import {
  ANTHROPIC_PROVIDER_ID,
  anthropicOfferedModelIds,
  lineupModelId,
} from "./anthropic-lineup";
import { AZURE_OPENAI, withAzureBaseUrl } from "./azure-openai";
import { CODEX_PROVIDER_ID, codexOfferedModelIds } from "./codex-offered";
import { endpointReachableCached } from "./endpoint-reachability";
import {
  MINIMAX_PROVIDER,
  minimaxOfferedModelIds,
  minimaxServedModelId,
} from "./minimax";
import {
  buildActiveCustomModel,
  customEndpointConfigured,
  customModelId,
  OPENAI_COMPATIBLE,
  setCustomModelId,
} from "./openai-compatible";
import {
  isPiOAuthProvider,
  isPiProvider,
  piModelIds,
  piProviderIds,
} from "./pi-catalog";
import { ModelNotOfferedError } from "./provider-error";
import { QWEN_PROVIDER_ID, qwenModel } from "./qwen-dashscope";
import {
  withXiaomiBaseUrl,
  XIAOMI_PROVIDER_ID,
  xiaomiOfferedModelIds,
} from "./xiaomi-endpoint";

export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "opencode"
  | "opencode-go"
  | "openrouter"
  | "deepseek"
  | "google"
  | "amazon-bedrock"
  | "minimax"
  | "openai-compatible"
  | (string & {});

export type ProviderAuthMethod = "oauth" | "apiKey" | "openaiCompatible";

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
    id: "deepseek",
    name: "DeepSeek",
    defaultModel: config.deepseekModel,
    auth: "apiKey",
  },
  {
    id: "google",
    name: "Google Gemini",
    defaultModel: config.geminiModel,
    auth: "apiKey",
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    defaultModel: config.bedrockModel,
    auth: "apiKey",
  },
  {
    id: "minimax",
    name: "MiniMax",
    defaultModel: config.minimaxModel,
    auth: "apiKey",
  },
  {
    id: "openai-compatible",
    name: "Local model (OpenAI-compatible)",
    defaultModel: "",
    auth: "openaiCompatible",
  },
];

export function providerAuthMethod(id: string): ProviderAuthMethod {
  const curated = PROVIDERS.find((p) => p.id === id);
  if (curated) return curated.auth;
  if (isPiProvider(id)) return isPiOAuthProvider(id) ? "oauth" : "apiKey";
  return "oauth";
}

export function providerDefaultModel(id: string): string {
  const curated = PROVIDERS.find((p) => p.id === id);
  if (curated) return curated.defaultModel;
  return uncuratedDefaultModel(id) ?? "";
}

function firstCatalogModel(id: string): string | undefined {
  return piModelIds(id)[0];
}

export const isProvider = (s: string): s is ProviderId =>
  PROVIDERS.some((p) => p.id === s) || isPiProvider(s);

type Settings = {
  activeProvider?: ProviderId;
  models?: Partial<Record<ProviderId, string>>;
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
  const tmp = atomicTempPath(settingsFile);
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, settingsFile);
}

function uncuratedDefaultModel(provider: string): string | undefined {
  const preferred = DEFAULT_MODEL[provider];
  if (preferred && piModelIds(provider).includes(preferred)) return preferred;
  return firstCatalogModel(provider);
}

function defaultModel(provider: ProviderId): string {
  const found = PROVIDERS.find((p) => p.id === provider);
  if (found) return found.defaultModel;
  const preferred = uncuratedDefaultModel(provider);
  if (preferred) return preferred;
  throw new Error(`unknown provider: ${provider}`);
}

export function modelFor(provider: ProviderId): string {
  if (provider === OPENAI_COMPATIBLE) return customModelId();
  return loadSettings().models?.[provider] ?? defaultModel(provider);
}

export function providerConfigured(id: ProviderId): boolean {
  if (id === OPENAI_COMPATIBLE) return customEndpointConfigured();
  return providerConnected(authStorage, id);
}

function providerUsable(id: ProviderId): boolean {
  if (!providerConfigured(id)) return false;
  if (authFailureActive(id)) return false;
  return id === OPENAI_COMPATIBLE ? endpointReachableCached() : true;
}

export function activeEffort(): string | null {
  return loadSettings().effort ?? null;
}

export function pickActiveProvider(
  saved: ProviderId | undefined,
  authedIds: ProviderId[],
): ProviderId | null {
  if (saved) return authedIds.includes(saved) ? saved : null;
  return authedIds[0] ?? null;
}

function candidateProviderIds(): ProviderId[] {
  const curated = PROVIDERS.map((p) => p.id);
  const seen = new Set(curated);
  const extras = piProviderIds().filter((id) => !seen.has(id));
  return [...curated, ...extras];
}

function connectedProviderIds(): ProviderId[] {
  return candidateProviderIds().filter((id) => providerConfigured(id));
}

export function savedActiveProvider(): ProviderId | null {
  return loadSettings().activeProvider ?? null;
}

export function activeProvider(): ProviderId | null {
  return pickActiveProvider(
    loadSettings().activeProvider,
    connectedProviderIds(),
  );
}

const OPENCODE_GATEWAYS: readonly ProviderId[] = ["opencode", "opencode-go"];

export function credentialSiblingIds(pid: ProviderId): ProviderId[] {
  return OPENCODE_GATEWAYS.includes(pid) ? [...OPENCODE_GATEWAYS] : [pid];
}

export function pickClaimedProvider(
  saved: ProviderId | undefined,
  authedIds: ProviderId[],
  connected: ProviderId,
  connectedSiblings: ProviderId[],
): ProviderId | null {
  if (saved) return null;
  const others = authedIds.filter((id) => !connectedSiblings.includes(id));
  return others[0] ?? connected;
}

export function claimActiveProvider(pid: string): Settings {
  if (!isProvider(pid)) throw new Error(`unknown provider: ${pid}`);
  const s = loadSettings();
  const authed = connectedProviderIds();
  const claim = pickClaimedProvider(
    s.activeProvider,
    authed,
    pid,
    credentialSiblingIds(pid),
  );
  if (!claim || claim === s.activeProvider) return s;
  return setSettings({ activeProvider: claim });
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
    if (prov === OPENAI_COMPATIBLE) setCustomModelId(input.model);
    else s.models = { ...s.models, [prov]: input.model };
  }
  if (input.effort) s.effort = input.effort;
  saveSettings(s);
  return s;
}

export function safeGetModel(
  provider: string,
  requestedId: string,
  pinned: boolean,
) {
  const modelId = minimaxServedModelId(
    provider,
    lineupModelId(provider, requestedId),
    providerDefaultModel(provider),
  );

  const pp = provider as BuiltinProvider;
  const mp = modelId as Parameters<typeof getModel>[1];
  const lookup = (id: string): Model<Api> => {
    const m = (
      provider === QWEN_PROVIDER_ID
        ? qwenModel(id)
        : getModel(pp, id as Parameters<typeof getModel>[1])
    ) as Model<Api>;
    if (m && provider === AZURE_OPENAI) return withAzureBaseUrl(m);
    if (m && provider === XIAOMI_PROVIDER_ID) return withXiaomiBaseUrl(m);
    return m;
  };
  const offered = safeModelIds(provider as ProviderId);
  if (pinned) {
    const m =
      offered.length > 0 && !offered.includes(modelId) ? undefined : lookup(mp);
    if (!m)
      throw new ModelNotOfferedError(
        provider,
        modelId,
        providerDefaultModel(provider),
      );
    return m;
  }
  if (offered.length > 0 && !offered.includes(modelId)) {
    const fallback = providerDefaultModel(provider);
    console.warn(
      `[providers] ${provider} model "${modelId}" is not offered; ` +
        `falling back to "${fallback}"`,
    );
    return lookup(fallback);
  }
  return lookup(mp);
}

export function canonicalPinProvider(id: string): string {
  return toCanonicalProviderId(id);
}

export function resolveModel(
  override?: string | null,
  providerOverride?: string | null,
): Model<Api> {
  let provider: ProviderId | null;
  if (providerOverride) {
    const canonical = canonicalPinProvider(providerOverride);
    if (!isProvider(canonical))
      throw new Error(`unknown provider: ${providerOverride}`);
    provider = canonical;
  } else {
    provider = activeProvider();
  }
  if (!provider)
    throw new Error("No provider connected. Connect an AI provider first.");
  if (provider === OPENAI_COMPATIBLE)
    return buildActiveCustomModel(override || undefined);
  return safeGetModel(provider, override || modelFor(provider), !!override);
}

export function safeModelIds(provider: ProviderId): string[] {
  if (provider === OPENAI_COMPATIBLE) {
    const m = customModelId();
    return m ? [m] : [];
  }
  if (provider === XIAOMI_PROVIDER_ID)
    return xiaomiOfferedModelIds(piModelIds(provider));
  if (provider === CODEX_PROVIDER_ID)
    return codexOfferedModelIds(piModelIds(provider));
  if (provider === ANTHROPIC_PROVIDER_ID)
    return anthropicOfferedModelIds(piModelIds(provider));
  if (provider === MINIMAX_PROVIDER)
    return minimaxOfferedModelIds(piModelIds(provider));
  return piModelIds(provider);
}

function savedModelRuns(id: ProviderId): string {
  const modelId = lineupModelId(id, modelFor(id));
  const offered = safeModelIds(id);
  return offered.length > 0 && !offered.includes(modelId)
    ? providerDefaultModel(id)
    : modelId;
}

function providerRow(id: ProviderId, name: string, active: ProviderId | null) {
  const servedScope = servedScopeFor(id);
  return {
    id,
    name,
    configured: providerUsable(id),
    isActive: id === active,
    activeModel: savedModelRuns(id),
    models: safeModelIds(id),
    ...(servedScope ? { credentialScope: servedScope } : {}),
    health: providerHealth(id),
  };
}

function providerHealth(id: ProviderId): ProviderHealth {
  if (!providerConfigured(id)) return "not_connected";
  if (authFailureActive(id)) return "needs_reconnect";
  if (quotaExhaustedActive(id)) return "out_of_credits";
  if (id === OPENAI_COMPATIBLE && !endpointReachableCached())
    return "unreachable";
  return "connected";
}

export function listProviders() {
  const active = activeProvider();
  const curated = new Set(PROVIDERS.map((p) => p.id));
  const rows = PROVIDERS.map((p) => providerRow(p.id, p.name, active));
  for (const id of piProviderIds()) {
    if (!curated.has(id) && providerUsable(id))
      rows.push(providerRow(id, id, active));
  }
  return rows;
}
