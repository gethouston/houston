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
import {
  buildActiveCustomModel,
  customEndpointConfigured,
  customModelId,
  OPENAI_COMPATIBLE,
  setCustomModelId,
} from "./openai-compatible";

/**
 * Supported providers. The provider id is the SAME string pi-ai uses for its
 * model provider, so a stored credential under `id` authenticates
 * `getModel(id, ...)` directly — whether that credential is an OAuth token
 * (Claude / Codex subscriptions) or a pasted API key (OpenCode Zen / Go,
 * OpenRouter, Gemini, Amazon Bedrock). The OpenAI-compatible
 * (local) provider is the exception — its model is hand-built (see
 * `./openai-compatible`), not fetched from a pi catalog.
 */
export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "opencode"
  | "opencode-go"
  | "openrouter"
  | "google"
  | "amazon-bedrock"
  | "openai-compatible";

/**
 * How a provider authenticates:
 * - `oauth` — subscription sign-in (Claude / Codex / Copilot).
 * - `apiKey` — a pasted key for a built-in pi gateway (OpenCode / OpenRouter / Gemini / Bedrock).
 * - `openaiCompatible` — a user-supplied base URL + model id (+ optional key) for a
 *   local OpenAI-compatible server (Ollama / vLLM / LM Studio). LOCAL profile only:
 *   the URL is the user's own machine, unreachable from a cloud runtime.
 */
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
    id: "openai-compatible",
    name: "Local model (OpenAI-compatible)",
    // No catalog default — the model id is whatever the user's server serves,
    // stored on the endpoint config (settings.customModel), read by modelFor().
    defaultModel: "",
    auth: "openaiCompatible",
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
  if (provider === OPENAI_COMPATIBLE) return customModelId();
  return loadSettings().models?.[provider] ?? defaultModel(provider);
}

/**
 * Whether a provider is connected. For the OpenAI-compatible provider that means
 * the endpoint (base URL + model) is configured — NOT merely that a key exists,
 * since keyless local servers store only a placeholder key. Every other provider
 * is "connected" iff it has a STORED credential (`providerConnected`, the HOU-557
 * stored-only rule — env vars / overrides don't count and aren't logout-clearable).
 */
function providerConfigured(id: ProviderId): boolean {
  if (id === OPENAI_COMPATIBLE) return customEndpointConfigured();
  return providerConnected(authStorage, id);
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
  // `providerConfigured` over `providerConnected` so the OpenAI-compatible
  // provider counts when its endpoint is set (it has only a placeholder key).
  const authed = PROVIDERS.filter((p) => providerConfigured(p.id)).map(
    (p) => p.id,
  );
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
    // The OpenAI-compatible model id lives on the endpoint config, not the
    // per-provider model map — keep one source of truth so modelFor + the
    // built model agree.
    if (prov === OPENAI_COMPATIBLE) setCustomModelId(input.model);
    else s.models = { ...s.models, [prov]: input.model };
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
 * the one exception NOT auto-corrected, but it IS validated: an unavailable pin
 * throws a clean "model not available" Error (pi-ai's getModel returns
 * `undefined` rather than throwing) so the turn fails with a readable reason
 * instead of a downstream TypeError.
 */
export function safeGetModel(
  provider: string,
  modelId: string,
  pinned: boolean,
) {
  const pp = provider as KnownProvider;
  const mp = modelId as Parameters<typeof getModel>[1];
  if (pinned) {
    // pi-ai's getModel returns `undefined` (it never throws) for an id the
    // provider doesn't offer. A pinned id is NOT auto-corrected, but it must
    // still be validated here: returning undefined would crash the turn
    // downstream with a raw `Cannot read properties of undefined` TypeError.
    const m = getModel(pp, mp);
    if (!m) throw new Error(`${provider} model "${modelId}" is not available`);
    return m;
  }
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
 * the provider default (see safeGetModel) rather than hard-failing the turn. The
 * OpenAI-compatible provider isn't a pi KnownProvider, so it builds its model by
 * hand instead.
 */
export function resolveModel(override?: string | null): Model<Api> {
  const provider = activeProvider();
  if (!provider)
    throw new Error("No provider connected. Connect an AI provider first.");
  // The OpenAI-compatible (local) provider isn't a pi KnownProvider, so its
  // model is hand-built rather than fetched from a catalog. Every other provider
  // goes through safeGetModel, which validates a pinned id (a bad pin throws a
  // clean "model not available" error) but falls a stale SAVED id back to the
  // provider default rather than hard-failing the turn.
  if (provider === OPENAI_COMPATIBLE)
    return buildActiveCustomModel(override || undefined);
  return safeGetModel(provider, override || modelFor(provider), !!override);
}

function safeModelIds(provider: ProviderId): string[] {
  // The OpenAI-compatible provider has no pi catalog; its only "model" is the
  // single one the user configured on the endpoint.
  if (provider === OPENAI_COMPATIBLE) {
    const m = customModelId();
    return m ? [m] : [];
  }
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
    configured: providerConfigured(p.id),
    isActive: p.id === active,
    activeModel: modelFor(p.id),
    models: safeModelIds(p.id),
  }));
}
