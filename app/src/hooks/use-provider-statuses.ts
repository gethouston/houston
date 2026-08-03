import { useQuery } from "@tanstack/react-query";
import { newEngineActive } from "../lib/engine";
import { osIsTauri } from "../lib/os-bridge";
import {
  classifyStatusScan,
  ProviderProbeUnreachableError,
  providerProbeReady,
  providerStatusesLoading,
  providerStatusesQueryKey,
  providerStatusesRefetchInterval,
} from "../lib/provider-statuses-query";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getVisibleProviders,
} from "../lib/providers";
import { queryKeys } from "../lib/query-keys";
import { type ProviderStatus, tauriProvider } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";
import { useProviderCatalog } from "./use-provider-catalog";

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
  /**
   * The probe FAILED — including the case where it "succeeded" with nothing
   * but `unknown`s, which means the engine was unreachable (HOU-1153). Consumers
   * that make a claim about the world (the connect-AI composer's "you have no
   * AI connected") must fail closed on this; the picker settles on its
   * "Connect more providers" state, because a spinner with no end is worse.
   */
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
 *
 * SPACE SAFETY (HOU-979). Provider connections are tenant data and the probe
 * routes per-agent, so this query carries the SAME two guards the AI-hub's
 * sibling hook has:
 *
 *  1. the active workspace id is part of the key, so team and personal never
 *     share a cache entry (the active space is only a request header — without
 *     this they collide and one space can serve the other's statuses); and
 *  2. the query is disabled until the CURRENT space's agent list has settled,
 *     so the probe is never routed at the previous space's agent under the new
 *     org header (which 404s and stamps every provider `unknown` — the picker
 *     then rendered no providers at all).
 *
 * The gate is the natural refetch trigger too: `enabled` flipping true once
 * agents settle makes TanStack fetch the new space's key immediately, with no
 * hand-rolled effect.
 *
 * UNREACHABLE IS AN ERROR (HOU-1153). The engine adapter's batched probe never
 * rejects: a host still booting, a cold pod, or unsettled per-agent routing all
 * resolve every provider as `unknown`. Taken at face value that is a settled
 * answer, so nothing ever retried — the picker sat on "Loading providers…"
 * indefinitely and the connect-AI composer never appeared. Here the RESULT is
 * classified (`classifyStatusScan`) and an information-free scan is thrown, so
 * the query carries a real error state and a bounded re-probe
 * (`providerStatusesRefetchInterval`) lands the definitive answer seconds later
 * with no user action. The AI-hub's sibling hook keeps consuming the raw
 * all-unknown shape on purpose — it has a last-known snapshot to protect.
 */
export function useProviderStatuses(): ProviderStatusesState {
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  // The pi-ai catalog hydrates `PROVIDERS` IN PLACE, so `getVisibleProviders`
  // grows from the override-only seed to the full runnable set with no React
  // signal. Fold `updatedAt` into the query key so statuses are re-probed for
  // the FULL set the moment the catalog resolves — not just the seed captured on
  // first mount. `useProviderCatalog` shares the `["provider-catalog"]` query, so
  // this reads the cache and never triggers a second catalog fetch.
  const { updatedAt: catalogUpdatedAt } = useProviderCatalog();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const agentsLoading = useAgentStore((s) => s.loading);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const probeReady = providerProbeReady({
    loaded: agentsLoaded,
    loading: agentsLoading,
  });

  const query = useQuery({
    queryKey: providerStatusesQueryKey({
      base: queryKeys.providerStatuses(capabilities?.providers ?? null),
      catalogUpdatedAt,
      workspaceId,
    }),
    queryFn: async (): Promise<Record<string, ProviderStatus>> => {
      const providers = getVisibleProviders({
        newEngine,
        desktop: osIsTauri(),
        capabilities: providerCapabilities,
      });
      // ONE round-trip for every provider (HOU-650): on the new engine this is a
      // single listProviders(), versus the old per-provider probe that fired N
      // identical round-trips to the agent's sandbox each time the picker opened.
      const ids = providers.map((p) => p.id);
      const scan = await tauriProvider.checkAllStatuses(ids);
      // The adapter never rejects — an unreachable engine resolves every
      // provider as `unknown` (HOU-1153). Reject on that shape so this query
      // has an ERROR state: without it the picker read "every provider is
      // checking" as a settled answer and spun forever.
      if (classifyStatusScan(ids, scan) === "unreachable")
        throw new ProviderProbeUnreachableError();
      return scan;
    },
    enabled: probeReady,
    staleTime: 30_000,
    // The client default is `retry: false`; a probe against a host that is
    // merely booting deserves one immediate second chance before the picker
    // settles on its empty state. Deliberately small — the re-probe below is
    // what actually carries the recovery, on a predictable cadence rather than
    // an ever-growing backoff.
    retry: 1,
    // Self-heal: keep re-probing while the last answer was a failure, and stop
    // dead once a definitive one lands.
    refetchInterval: (query) =>
      providerStatusesRefetchInterval({ status: query.state.status }),
  });

  return {
    statuses: query.data ?? {},
    isLoading: providerStatusesLoading({
      hasData: query.data !== undefined,
      queryIsLoading: query.isLoading,
      probeReady,
    }),
    isError: query.isError,
  };
}
