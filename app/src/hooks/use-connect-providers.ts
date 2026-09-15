import { useCallback, useMemo } from "react";
import { newEngineActive } from "../lib/engine";
import { osIsTauri } from "../lib/os-bridge";
import {
  connectProviderName,
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../lib/providers";
import { useCapabilities } from "./use-capabilities";

/**
 * The provider account cards THIS deployment actually serves.
 *
 * The one gated list every connect surface resolves through, so a card, a step
 * title and a picker row can never disagree about which providers exist. A
 * model may name any provider it can read, including the local
 * OpenAI-compatible one a hosted deployment does not serve
 * (`openaiCompatible: false`); a miss here is simply unavailable, which is what
 * the surfaces already render.
 */
export function useConnectProviders(): readonly ProviderInfo[] {
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  // Hosted capabilities arrive a beat late; until they do, the empty set gates
  // the list rather than the desktop-complete catalog.
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  return useMemo(
    () =>
      getConnectProviders({
        newEngine,
        desktop: osIsTauri(),
        capabilities: providerCapabilities,
      }),
    [newEngine, providerCapabilities],
  );
}

/**
 * Names a requested provider through that same gated list, so a chat step's
 * title and the connect card beneath it can never name different things.
 */
export function useConnectProviderName(): (providerId: string) => string {
  const connect = useConnectProviders();
  return useCallback(
    (providerId: string) => connectProviderName(connect, providerId),
    [connect],
  );
}
