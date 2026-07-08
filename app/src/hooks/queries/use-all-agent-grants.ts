import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";

/**
 * The grant sets for MANY agents at once (the global Integrations page: which
 * agents may use each connected account — the grant unit is the account's
 * connection id, not the toolkit). Runs one query per agent through
 * `useQueries`, sharing the same `queryKeys.agentGrants(id)` cache entries the
 * per-agent tab uses, so a toggle on one surface is reflected on the other.
 *
 * A per-agent value of `null` means the host answered 404 = grants unsupported;
 * once ANY agent resolves `null`, `supported` is false and the surface renders
 * "every agent can use this" instead of broken per-agent toggles.
 */
export function useAllAgentGrants(
  agentIds: string[],
  enabled: boolean,
): {
  byAgent: ReadonlyMap<string, string[] | null>;
  isLoading: boolean;
  supported: boolean;
} {
  const results = useQueries({
    queries: agentIds.map((id) => ({
      queryKey: queryKeys.agentGrants(id),
      queryFn: () => tauriIntegrations.grants(id),
      enabled,
    })),
  });

  // A stable fingerprint of resolved data so the map identity only changes when
  // a grant set actually changes (not on every render of the parent).
  const fingerprint = agentIds
    .map((id, i) => {
      const data = results[i]?.data;
      return `${id}:${data === null ? "∅" : (data ?? []).join(",")}`;
    })
    .join("|");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `fingerprint` captures every meaningful change in `results`; depending on the array itself would rebuild the map every render (new identity each time).
  const byAgent = useMemo(() => {
    const map = new Map<string, string[] | null>();
    agentIds.forEach((id, i) => {
      const data = results[i]?.data;
      map.set(id, data === undefined ? null : data);
    });
    return map;
  }, [fingerprint]);

  const isLoading = enabled && results.some((r) => r.isLoading);
  const supported = !results.some((r) => r.data === null);

  return { byAgent, isLoading, supported };
}
