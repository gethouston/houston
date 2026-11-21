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

export function useConnectProviders(): readonly ProviderInfo[] {
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
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

export function useConnectProviderName(): (providerId: string) => string {
  const connect = useConnectProviders();
  return useCallback(
    (providerId: string) => connectProviderName(connect, providerId),
    [connect],
  );
}
