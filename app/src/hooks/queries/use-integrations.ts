import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";

/** Per-provider connection status (connected? whose account?). User-level. */
export function useIntegrationStatus() {
  return useQuery({
    queryKey: queryKeys.integrationStatus(),
    queryFn: () => tauriIntegrations.status(),
    staleTime: 30_000,
  });
}

/** The toolkits a provider connection currently has (after sign-in). */
export function useIntegrationConnections(provider: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.integrationConnections(provider),
    queryFn: () => tauriIntegrations.connections(provider),
    enabled,
  });
}

/**
 * The mutations below intentionally carry no `onError`: their `mutationFn`
 * routes through `tauriIntegrations.*`, every one of which is wrapped by the
 * `call()` adapter in `lib/tauri.ts`. `call()` already shows the real error as a
 * red toast AND captures it to Sentry (the "Report bug" path) before re-throwing,
 * so the failure is surfaced once. React Query catches the re-throw internally,
 * so `.mutate()` never leaks an unhandled rejection. Adding an `onError` here
 * would double-toast (a second, more generic message on top of the engine's).
 */
export function useDisconnectIntegration(provider: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (toolkit: string) =>
      tauriIntegrations.disconnect(provider, toolkit),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: queryKeys.integrationConnections(provider),
      }),
  });
}

export function useLogoutIntegration(provider: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => tauriIntegrations.logout(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.integrationStatus() });
      qc.invalidateQueries({
        queryKey: queryKeys.integrationConnections(provider),
      });
    },
  });
}
