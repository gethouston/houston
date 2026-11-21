import { useCallback } from "react";
import {
  type ProviderConnectionState,
  providerConnectionState,
} from "../../lib/provider-connection";
import type { ProviderInfo } from "../../lib/providers";
import type { ProviderStatus } from "../../lib/tauri";

export interface ProviderConnectionReaders {
  connectionState(p: ProviderInfo): ProviderConnectionState;
}

export function useConnectionReaders(
  statuses: Record<string, ProviderStatus | undefined>,
  loading: boolean,
): ProviderConnectionReaders {
  const connectionState = useCallback(
    (p: ProviderInfo): ProviderConnectionState =>
      providerConnectionState(statuses[p.id], loading),
    [statuses, loading],
  );
  return { connectionState };
}
