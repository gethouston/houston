/**
 * Block sends when the resolved model is chat-only under the CLI harness.
 * Prevents models that hallucinate fake tool calls instead of using Codex bash.
 */

import { isConfigProvider } from "../data/config";
import { agentForEngine, resolveEngine } from "./engine-for-agent";
import i18n from "./i18n";
import { getDefaultModel, getModel, modelSupportsAgenticTools, normalizeLegacyModel, validModelOrNull } from "./providers";
import type { Agent } from "./types";

const CONFIG_REL_PATH = ".houston/config/config.json";
const DEFAULT_PROVIDER = "anthropic";
const CONFIG_CACHE_MS = 30_000;

type ConfigCacheEntry = { raw: string | null; expiresAt: number };
const configCache = new Map<string, ConfigCacheEntry>();

/** Drop cached agent config reads (e.g. after ConfigChanged). */
export function invalidateAgenticPreflightCache(agentPath?: string): void {
  if (agentPath) configCache.delete(agentPath);
  else configCache.clear();
}

async function readAgentConfigRaw(agentPath: string): Promise<string | null> {
  const hit = configCache.get(agentPath);
  if (hit && hit.expiresAt > Date.now()) return hit.raw;
  const engine = await resolveEngine(agentForEngine(agentPath), agentPath);
  const raw = await engine.readAgentFile(agentPath, CONFIG_REL_PATH);
  configCache.set(agentPath, { raw, expiresAt: Date.now() + CONFIG_CACHE_MS });
  return raw;
}

async function resolveSendConfig(
  agentPath: string,
  providerOverride?: string,
  modelOverride?: string,
  _agentOverride?: Agent | null,
): Promise<{ provider: string; model: string; label: string }> {
  const trimmedProviderOverride = providerOverride?.trim();
  const trimmedModelOverride = modelOverride?.trim();

  if (
    trimmedProviderOverride &&
    isConfigProvider(trimmedProviderOverride) &&
    trimmedModelOverride
  ) {
    const validOverride = validModelOrNull(trimmedProviderOverride, trimmedModelOverride);
    if (validOverride) {
      const model = getModel(trimmedProviderOverride, validOverride);
      return {
        provider: trimmedProviderOverride,
        model: validOverride,
        label: model?.label ?? validOverride,
      };
    }
  }

  const raw = await readAgentConfigRaw(agentPath);
  let cfg: { provider?: string; model?: string } | null = null;
  if (raw) {
    try {
      cfg = JSON.parse(raw) as { provider?: string; model?: string };
    } catch {
      /* fall through */
    }
  }

  let provider: string;
  if (trimmedProviderOverride && isConfigProvider(trimmedProviderOverride)) {
    provider = trimmedProviderOverride;
  } else {
    const fromConfig = cfg?.provider?.trim();
    provider = fromConfig && isConfigProvider(fromConfig) ? fromConfig : DEFAULT_PROVIDER;
  }

  const validOverride = trimmedModelOverride
    ? validModelOrNull(provider, trimmedModelOverride)
    : null;
  if (validOverride) {
    const model = getModel(provider, validOverride);
    return { provider, model: validOverride, label: model?.label ?? validOverride };
  }

  if (cfg?.model) {
    const fromConfig = normalizeLegacyModel(cfg.model.trim() ?? null);
    const valid = validModelOrNull(provider, fromConfig);
    if (valid) {
      const model = getModel(provider, valid);
      return { provider, model: valid, label: model?.label ?? valid };
    }
  }

  const fallback = getDefaultModel(provider);
  const model = getModel(provider, fallback);
  return { provider, model: fallback, label: model?.label ?? fallback };
}

/** Throws when the resolved model cannot run agent tools under the CLI harness. */
export async function assertAgenticModelPreflight(
  agentPath: string,
  providerOverride?: string,
  modelOverride?: string,
  agentOverride?: Agent | null,
): Promise<void> {
  const resolved = await resolveSendConfig(
    agentPath,
    providerOverride,
    modelOverride,
    agentOverride,
  );
  if (modelSupportsAgenticTools(resolved.provider, resolved.model)) return;

  const modelsHint = i18n.t("chat:agenticPreflight.modelsHint");
  throw new Error(
    i18n.t("chat:agenticPreflight.blocked", { label: resolved.label, modelsHint }),
  );
}
