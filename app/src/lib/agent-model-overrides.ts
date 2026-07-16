/**
 * The agent's configured brain, as per-turn wire pins for send paths that
 * assemble their own overrides (the routine and custom-integration setup-chat
 * kickoffs) instead of holding the chat panel's live state.
 *
 * A send WITHOUT provider/model pins does not run on the agent's configured
 * model: the runtime resolves an unpinned turn from its OWN `settings.json`
 * (`activeProvider` + `models[provider]`), never from the agent config the
 * model picker writes (`.houston/config/config.json`) — so it lands on the
 * provider default (Sonnet). The config only reaches a turn as the pins each
 * send forwards, which is exactly what the chat panel's `effectiveProvider` /
 * `effectiveModel` do; this is the same resolution for kickoffs created
 * outside a panel.
 */

import {
  getDefaultModel,
  normalizeLegacyModel,
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

/**
 * Resolve the kickoff pins from a loaded agent config, mirroring the chat
 * panel's chain: a stored provider counts only while it's still offered; the
 * stored model (legacy aliases normalized) must belong to it, else the
 * provider's catalog default; effort is clamped to what that model accepts.
 * No valid stored provider → no pins at all, so the runtime resolves the turn
 * exactly as before (its active provider), never a half-pin the runtime would
 * reject.
 */
export function resolveAgentModelOverrides(
  cfg: BrainConfig,
): AgentModelOverrides {
  const provider = validProviderOrNull(cfg.provider);
  if (!provider) return {};
  const model =
    validModelOrNull(provider, normalizeLegacyModel(cfg.model)) ??
    getDefaultModel(provider);
  const effort = cfg.effort
    ? validEffortOrDefault(provider, model, cfg.effort)
    : undefined;
  return {
    providerOverride: provider,
    modelOverride: model,
    ...(effort ? { effortOverride: effort } : {}),
  };
}

/**
 * Read + resolve in one step (the send-path convenience, mirrors
 * `readAgentTurnMode`). A failed config read falls back to no pins — the safe
 * default for a preference lookup; the send itself still surfaces its errors.
 */
export async function readAgentModelOverrides(
  agentPath: string,
  readConfig: (path: string) => Promise<BrainConfig>,
): Promise<AgentModelOverrides> {
  try {
    return resolveAgentModelOverrides(await readConfig(agentPath));
  } catch {
    return {};
  }
}
