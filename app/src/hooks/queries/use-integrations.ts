import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";

/** Per-provider readiness (usable now? needs a Houston sign-in?). User-level. */
export function useIntegrationStatus() {
  return useQuery({
    queryKey: queryKeys.integrationStatus(),
    queryFn: () => tauriIntegrations.status(),
    staleTime: 30_000,
  });
}

/** The apps the user has connected through a provider. */
export function useIntegrationConnections(provider: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.integrationConnections(provider),
    queryFn: () => tauriIntegrations.connections(provider),
    enabled,
  });
}

/**
 * The provider's app catalog (name, logo, description per toolkit). Big and
 * near-static, so cache it for the session — the tab uses it to render real
 * app cards instead of machine slugs.
 */
export function useIntegrationToolkits(provider: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.integrationToolkits(provider),
    queryFn: () => tauriIntegrations.toolkits(provider),
    enabled,
    staleTime: 60 * 60 * 1000,
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

/**
 * Multiplayer only: the integration toolkit slugs this agent may use (the
 * per-(user, agent) grant set from C4). Gated on the `multiplayer` capability
 * via `enabled` — the local/desktop engine has no grant routes, so the query
 * stays idle in single-player and the tab renders without grant sections.
 */
export function useAgentGrants(agentId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.agentGrants(agentId),
    queryFn: () => tauriIntegrations.grants(agentId),
    enabled,
  });
}

/**
 * Multiplayer only: replace this agent's grant set (an instant replace-set PUT
 * per C4). Invalidates `agentGrants` so the granted/available split re-renders
 * live. Carries no `onError` for the same reason as the mutations above: the
 * `call()` wrapper already surfaces + reports the failure once.
 */
export function useSetAgentGrants(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (toolkits: string[]) =>
      tauriIntegrations.setGrants(agentId, toolkits),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.agentGrants(agentId) }),
  });
}
