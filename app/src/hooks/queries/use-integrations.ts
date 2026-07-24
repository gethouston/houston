import type { CustomIntegrationView } from "@houston-ai/engine-client";
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
    mutationFn: (toolkit: string) =>
      tauriIntegrations.disconnect(provider, toolkit),
    onSuccess: (_data, toolkit) => {
      analytics.track("integration_disconnected", {
        integration_slug: toolkit,
      });
      qc.invalidateQueries({
        queryKey: queryKeys.integrationConnections(provider),
      });
    },
  });
}

/**
 * HOU-550: the user's custom (API / MCP) integrations. User-level (one list,
 * shared across agents), gated on the `integrations` capability like the status
 * query above so an integrations-off deployment never fetches.
 *
 * Data is `CustomIntegrationView[] | null`: `null` means the host answered 404 =
 * the feature is unsupported (an old build or a gateway-fronted pod), which the
 * caller renders as "hide all custom-integration UI" rather than an empty list.
 */
export function useCustomIntegrations() {
  const { capabilities } = useCapabilities();
  return useQuery<CustomIntegrationView[] | null>({
    queryKey: queryKeys.customIntegrations(),
    queryFn: () => tauriIntegrations.customList(),
    enabled: integrationsSupported(capabilities),
  });
}

/**
 * The SAME list through the per-agent surface (HOU-823) — the one form a
 * gateway-fronted deployment proxies to the agent's pod, so the in-chat
 * credential card resolves the integration's name + auth fields on managed
 * cloud too (where the top-level read 404s at the gateway → `null` → the card
 * would degrade to its generic fallback field).
 */
export function useAgentCustomIntegrations(agentId: string) {
  const { capabilities } = useCapabilities();
  return useQuery<CustomIntegrationView[] | null>({
    queryKey: queryKeys.agentCustomIntegrations(agentId),
    queryFn: () => tauriIntegrations.customListForAgent(agentId),
    enabled: integrationsSupported(capabilities),
  });
}

/**
 * Remove a custom integration entirely. Carries no `onError` for the same reason
 * as the mutations above — the `call()` wrapper surfaces + reports once. On
 * success both the custom list and the merged connections view drop it.
 */
export function useRemoveCustomIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => tauriIntegrations.customRemove(slug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customIntegrations() });
      qc.invalidateQueries({
        queryKey: queryKeys.integrationConnections("custom"),
      });
    },
  });
}

/**
 * Provide the secret for a `pending` custom integration. Returns the refreshed
 * view so a caller can read the new `active` state. No `onError` (see above).
 *
 * With `agentId` the save rides the per-agent surface (HOU-823) — REQUIRED
 * wherever a gateway may front the host (the in-chat credential card): the
 * top-level route 404s at the gateway, which failed every managed-cloud save.
 * Without it (the global Integrations page, a direct-host-only surface) the
 * top-level route serves as before. The invalidation targets the shared
 * "custom-integrations" prefix, so both reads refresh either way.
 */
export function useSubmitCustomCredential(agentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      slug,
      values,
    }: {
      slug: string;
      values: Record<string, string>;
    }) =>
      agentId
        ? tauriIntegrations.customCredentialForAgent(agentId, slug, values)
        : tauriIntegrations.customCredential(slug, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customIntegrations() });
      qc.invalidateQueries({
        queryKey: queryKeys.integrationConnections("custom"),
      });
    },
  });
}
