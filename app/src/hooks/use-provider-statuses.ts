import { useQuery } from "@tanstack/react-query";

import { tauriProvider, type ProviderStatus } from "../lib/tauri";
import { PROVIDERS } from "../lib/providers";
import { queryKeys } from "../lib/query-keys";

export interface ProviderStatusesState {
  /** Status by provider id. Empty until the first fetch resolves. */
  statuses: Record<string, ProviderStatus>;
  /**
   * True only on the FIRST load with no cached data, so the picker can show a
   * neutral "checking" state instead of a false "Not connected". Background
   * refetches with cached data keep this false, so reopening the picker never
   * flickers back to "checking".
   */
  isLoading: boolean;
  isError: boolean;
}

/**
 * Shared provider connection statuses, cached + reactive via TanStack Query.
 *
 * Replaces the per-mount `Promise.all(checkStatus)` the chat model picker ran
 * on every open (issue #342): the load-on-mount-only pattern showed every
 * provider as "Not connected" for the few seconds the engine spent probing the
 * provider CLIs. Keyed under `queryKeys.providerStatuses()` so it is
 * invalidated when a provider login completes (see use-agent-invalidation.ts);
 * `staleTime` keeps repeat opens instant, and the default window-focus refetch
 * picks up out-of-band auth changes.
 */
export function useProviderStatuses(): ProviderStatusesState {
  const query = useQuery({
    queryKey: queryKeys.providerStatuses(),
    queryFn: async (): Promise<Record<string, ProviderStatus>> => {
      const entries = await Promise.all(
        PROVIDERS.map(
          async (p) => [p.id, await tauriProvider.checkStatus(p.id)] as const,
        ),
      );
      return Object.fromEntries(entries);
    },
    staleTime: 30_000,
  });

  return {
    statuses: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
