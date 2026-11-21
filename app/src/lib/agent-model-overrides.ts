import {
  toCanonicalProviderId,
  toDisplayProviderIdOrNull,
} from "./provider-overrides.ts";
import {
  getDefaultModel,
  normalizeLegacyModel,
  PROVIDERS,
  validEffortOrDefault,
  validModelOrNull,
  validProviderOrNull,
} from "./providers.ts";

export interface AgentModelOverrides {
  providerOverride?: string;
  modelOverride?: string;
  effortOverride?: string;
}

interface BrainConfig {
  provider?: string;
  model?: string;
  effort?: string;
}

function usableProvider(
  configured: string | null,
  connected: readonly string[] | null,
): string | null {
  if (!connected) return configured;
  const usable = new Set(
    connected.map((id) => toDisplayProviderIdOrNull(id) ?? id),
  );
  if (configured && usable.has(configured)) return configured;
  return PROVIDERS.find((p) => usable.has(p.id))?.id ?? configured;
}

export function resolveAgentModelOverrides(
  cfg: BrainConfig,
  connected: readonly string[] | null = null,
): AgentModelOverrides {
  const configured = validProviderOrNull(
    toDisplayProviderIdOrNull(cfg.provider),
  );
  const provider = usableProvider(configured, connected);
  if (!provider) return {};
  const stored = provider === configured;
  const model =
    (stored
      ? validModelOrNull(provider, normalizeLegacyModel(cfg.model, provider))
      : null) ?? getDefaultModel(provider);
  const effort =
    stored && cfg.effort
      ? validEffortOrDefault(provider, model, cfg.effort)
      : undefined;
  return definedPins({
    providerOverride: provider,
    modelOverride: model,
    effortOverride: effort,
  });
}

export function definedPins(pins: AgentModelOverrides): AgentModelOverrides {
  return {
    ...(pins.providerOverride
      ? { providerOverride: pins.providerOverride }
      : {}),
    ...(pins.modelOverride ? { modelOverride: pins.modelOverride } : {}),
    ...(pins.effortOverride ? { effortOverride: pins.effortOverride } : {}),
  };
}

export function activityRowPin(pins: AgentModelOverrides): {
  provider?: string;
  model?: string;
} {
  const defined = definedPins(pins);
  return {
    ...(defined.providerOverride
      ? { provider: toCanonicalProviderId(defined.providerOverride) }
      : {}),
    ...(defined.modelOverride ? { model: defined.modelOverride } : {}),
  };
}

export async function readAgentModelOverrides(
  agentPath: string,
  readConfig: (path: string) => Promise<BrainConfig>,
  connected: readonly string[] | null = null,
): Promise<AgentModelOverrides> {
  try {
    return resolveAgentModelOverrides(await readConfig(agentPath), connected);
  } catch {
    return resolveAgentModelOverrides({}, connected);
  }
}
