import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { integrationsSupported } from "../../components/integrations/model";
import { analytics } from "../../lib/analytics";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";

/**
 * Per-provider readiness (usable now? needs a Houston sign-in?). User-level.
 *
 * Gated on the host-advertised `integrations` capability: a deployment with no
 * integration provider wired answers `/v1/integrations` with 503, so fetching
 * there would surface a red bug toast for a configuration that's perfectly
 * legitimate (dev host, self-host without a Composio key). The disabled query
 * stays idle with no data and the tab renders its unavailable state.
 */
export function useIntegrationStatus() {
  const { capabilities } = useCapabilities();
  return useQuery({
    queryKey: queryKeys.integrationStatus(),
    queryFn: () => tauriIntegrations.status(),
    staleTime: 30_000,
    enabled: integrationsSupported(capabilities),
  });
}

/**
 * Whether `provider` is REGISTERED on this host (present in the readiness
 * list, ready or not). Provider-scoped queries must AND-gate on this: a host
 * can serve the key-free `custom` provider with NO Composio at all (dev,
 * self-host without a key), and a Composio-scoped fetch there 404s ("unknown
 * integration provider") straight into a red toast — e.g. a transcript's old
 * connect card mounting its connections query.
 */
function useProviderRegistered(provider: string): boolean {
  const status = useIntegrationStatus();
  return !!status.data?.some((p) => p.provider === provider);
}

/** The apps the user has connected through a provider. */
export function useIntegrationConnections(provider: string, enabled: boolean) {
  const registered = useProviderRegistered(provider);
  return useQuery({
    queryKey: queryKeys.integrationConnections(provider),
    queryFn: () => tauriIntegrations.connections(provider),
    enabled: enabled && registered,
    staleTime: 30_000,
  });
}

/**
 * The provider's app catalog (name, logo, description per toolkit). Big and
 * near-static, so cache it for the session — the tab uses it to render real
 * app cards instead of machine slugs.
 */
export function useIntegrationToolkits(provider: string, enabled: boolean) {
  const registered = useProviderRegistered(provider);
  return useQuery({
    queryKey: queryKeys.integrationToolkits(provider),
    queryFn: () => tauriIntegrations.toolkits(provider),
    enabled: enabled && registered,
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
    // `connectionId` narrows the removal to ONE account of the toolkit (a
    // toolkit can hold several — two Gmail logins); omitted removes them all.
    mutationFn: ({
      toolkit,
      connectionId,
    }: {
      toolkit: string;
      connectionId?: string;
    }) => tauriIntegrations.disconnect(provider, toolkit, connectionId),
    onSuccess: (_data, { toolkit }) => {
      analytics.track("integration_disconnected", {
        integration_slug: toolkit,
      });
      qc.invalidateQueries({
        queryKey: queryKeys.integrationConnections(provider),
      });
    },
  });
}

// The custom (API / MCP) integration hooks live in
// `use-custom-integrations.ts` (HOU-550 / HOU-823 / HOU-980).
