import type { Config } from "../data/config";
import { toDisplayProviderIdOrNull } from "./provider-overrides.ts";
import { normalizeLegacyModel } from "./providers.ts";

/** The agent-config tier of the chat's provider chain, in the display dialect. */
export interface AgentTier {
  provider: string | null;
  model: string | null;
  effort: string | null;
}

/** Nothing read yet, or an agent with no configured brain. */
export const EMPTY_AGENT_TIER: AgentTier = {
  provider: null,
  model: null,
  effort: null,
};

/**
 * Project `.houston/config/config.json` onto the composer's agent tier.
 * Configs store pi's CANONICAL provider id (`openai-codex`) while the picker
 * speaks Houston's display id (`openai`); legacy Claude aliases (`opus`) are
 * normalized to explicit ids so a stored alias never falls through to the
 * provider default. `undefined` (the query has not answered) maps to the empty
 * tier — callers that need to tell "unknown" from "absent" read the query's
 * `isFetched` beside this.
 */
export function agentTierFromConfig(cfg: Config | undefined): AgentTier {
  if (!cfg) return EMPTY_AGENT_TIER;
  return {
    provider: toDisplayProviderIdOrNull(cfg.provider),
    model: normalizeLegacyModel(cfg.model ?? null, cfg.provider),
    effort: cfg.effort ?? null,
  };
}
