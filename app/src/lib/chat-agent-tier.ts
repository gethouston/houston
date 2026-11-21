import type { Config } from "../data/config";
import { toDisplayProviderIdOrNull } from "./provider-overrides.ts";
import { normalizeLegacyModel } from "./providers.ts";

export interface AgentTier {
  provider: string | null;
  model: string | null;
  effort: string | null;
}

export const EMPTY_AGENT_TIER: AgentTier = {
  provider: null,
  model: null,
  effort: null,
};

export function agentTierFromConfig(cfg: Config | undefined): AgentTier {
  if (!cfg) return EMPTY_AGENT_TIER;
  return {
    provider: toDisplayProviderIdOrNull(cfg.provider),
    model: normalizeLegacyModel(cfg.model ?? null, cfg.provider),
    effort: cfg.effort ?? null,
  };
}
