import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { integrationsSupported } from "../../components/integrations/model";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";
import {
  applyGrantChange,
  applyGrantChangeNullable,
  type GrantChange,
  reverseGrantChange,
} from "./grant-set";

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
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: queryKeys.integrationConnections(provider),
      }),
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
 */
export function useSubmitCustomCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      slug,
      values,
    }: {
      slug: string;
      values: Record<string, string>;
    }) => tauriIntegrations.customCredential(slug, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customIntegrations() });
      qc.invalidateQueries({
        queryKey: queryKeys.integrationConnections("custom"),
      });
    },
  });
}

/**
 * Multiplayer only: the integration toolkit slugs this agent may use (the
 * per-(user, agent) grant set from C4). Gated on the `multiplayer` capability
 * via `enabled` — the local/desktop engine has no grant routes, so the query
 * stays idle in single-player and the tab renders without grant sections.
 *
 * Data is `string[] | null`: `null` means the host answered 404 = grants
 * unsupported (a build that predates grants), which the caller renders as
 * "all agents can use this" rather than a broken toggle.
 */
export function useAgentGrants(agentId: string, enabled: boolean) {
  return useQuery<string[] | null>({
    queryKey: queryKeys.agentGrants(agentId),
    queryFn: () => tauriIntegrations.grants(agentId),
    enabled,
  });
}

/**
 * Multiplayer only: add or remove ONE toolkit in this agent's grant set. The
 * host API is a replace-set PUT (C4), so the next set is computed inside
 * `mutationFn` from the freshest cache value at mutate time — never from a set
 * a component captured earlier (a stale snapshot would wipe grants made in
 * between, e.g. while the OAuth poll was running). An optimistic `onMutate`
 * update (+ targeted rollback on error, + invalidation on settle) makes
 * overlapping add/remove mutations compose instead of resurrecting each other.
 * Carries no `onError` toast for the same reason as the mutations above: the
 * `call()` wrapper already surfaces + reports the failure once.
 */
export function useAgentGrantMutation(agentId: string) {
  const qc = useQueryClient();
  const key = queryKeys.agentGrants(agentId);
  return useMutation({
    mutationFn: (change: GrantChange) => {
      // Freshest value: includes this change's own optimistic update (onMutate
      // runs first) AND any other in-flight change's, so overlapping toggles
      // send the union rather than each other's stale snapshots. Re-applying
      // the change is idempotent over the optimistic value and covers the
      // edge where a refetch overwrote the cache in between.
      const current = qc.getQueryData<string[] | null>(key);
      // Grants unsupported (host answered 404 → cached null): never fire a PUT
      // that would fabricate a set the host has no route for. The UI gates
      // toggles on `supported`, so this is a defensive no-op, not a swallow.
      if (current === null) return Promise.resolve();
      return tauriIntegrations.setGrants(
        agentId,
        applyGrantChange(current ?? [], change),
      );
    },
    onMutate: async (change) => {
      // Stop a racing refetch from overwriting the optimistic value mid-flight.
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<string[] | null>(key, (prev) =>
        // A null (unsupported) cache stays null; an unloaded cache starts empty.
        applyGrantChangeNullable(prev === undefined ? [] : prev, change),
      );
    },
    onError: (_err, change) => {
      // Reverse ONLY this change (not a whole-set snapshot restore, which
      // would clobber another overlapping mutation's optimistic update); the
      // settle invalidation below re-syncs with the server regardless. A null
      // (unsupported) cache stays null — nothing to reverse.
      qc.setQueryData<string[] | null>(key, (prev) =>
        prev === null || prev === undefined
          ? (prev ?? null)
          : reverseGrantChange(prev, change),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
