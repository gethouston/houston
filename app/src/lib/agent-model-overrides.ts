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
 * outside a panel — INCLUDING the panel's auth gate, so a kickoff never opens
 * on a provider the user has not connected (PRODUCT-1236).
 */

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

/**
 * The provider a kickoff may actually run on (PRODUCT-1236).
 *
 * A setup chat's kickoff is a FRESH, message-less turn, so it follows the chat
 * composer's initial-selection rule (`resolveEffectiveProvider` case 2): the
 * configured provider is honored only while the user is signed into it,
 * otherwise the turn opens on a provider they ARE signed into. A pin is never
 * auth-gated downstream — the runtime honors `providerOverride` verbatim and
 * surfaces a provider error rather than switching — so pinning the agent's
 * stored `anthropic` for an OpenAI-only user is what made every routine/skill
 * creation chat open on a provider they never connected.
 *
 * `connected === null` means the scan could not confirm anything (still
 * loading, failed, or an unconfirmable probe): defer to the stored provider
 * rather than switch on a guess. A confirmed-empty set has nothing better to
 * offer, so the stored provider stands and its sign-in error is the surface.
 */
function usableProvider(
  configured: string | null,
  connected: readonly string[] | null,
): string | null {
  if (!connected) return configured;
  if (configured && connected.includes(configured)) return configured;
  // Registry order, not scan order, so the substitute is deterministic
  // regardless of how the caller enumerated statuses.
  return PROVIDERS.find((p) => connected.includes(p.id))?.id ?? configured;
}

/**
 * Resolve the kickoff pins from a loaded agent config, mirroring the chat
 * panel's chain: a stored provider counts only while it's still offered AND the
 * user is signed into it (see `usableProvider`); the stored model (legacy
 * aliases normalized) must belong to it, else the provider's catalog default;
 * effort is clamped to what that model accepts. Nothing to pin → no pins at
 * all, so the runtime resolves the turn exactly as before (its active
 * provider), never a half-pin the runtime would reject.
 *
 * When the stored provider is signed out and another one is connected, the pin
 * moves to that provider WHOLE: the stored model and effort belong to the
 * provider the user left behind, so the substitute takes its own catalog
 * default instead of carrying a model the new provider cannot run.
 *
 * @param connected provider ids the user is confirmed signed into, or `null`
 *   when that could not be confirmed (see `confirmedConnectedProviders`).
 */
export function resolveAgentModelOverrides(
  cfg: BrainConfig,
  connected: readonly string[] | null = null,
): AgentModelOverrides {
  const configured = validProviderOrNull(cfg.provider);
  const provider = usableProvider(configured, connected);
  if (!provider) return {};
  const stored = provider === configured;
  const model =
    (stored
      ? validModelOrNull(provider, normalizeLegacyModel(cfg.model))
      : null) ?? getDefaultModel(provider);
  const effort =
    stored && cfg.effort
      ? validEffortOrDefault(provider, model, cfg.effort)
      : undefined;
  return {
    providerOverride: provider,
    modelOverride: model,
    ...(effort ? { effortOverride: effort } : {}),
  };
}

/**
 * Read + resolve in one step for send paths that need the configured brain.
 * A failed config read falls back to the connected provider (or no pins when
 * there is none); the send itself still surfaces its own errors.
 */
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
