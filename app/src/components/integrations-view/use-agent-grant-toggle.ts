import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  applyGrantChange,
  applyGrantChangeNullable,
  type GrantChange,
  reverseGrantChange,
} from "../../hooks/queries/grant-set";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";

interface ToggleVars {
  agentId: string;
  toolkit: string;
  active: boolean;
}

/**
 * Toggle ONE toolkit in ONE agent's grant set, for the global page's detail
 * sheet where the agent is chosen at click time (so the per-agent
 * `useAgentGrantMutation`, whose agent id is fixed in a closure, cannot be
 * called in a variable-length loop without breaking the rules of hooks).
 *
 * Shares the same replace-set contract and optimistic cache behaviour as
 * `useAgentGrantMutation`, reusing the `grant-set` pure helpers, but carries the
 * agent id in the mutation variables so a single hook serves every agent row.
 * Writes the same `queryKeys.agentGrants(id)` cache entries `useAllAgentGrants`
 * reads, so a toggle reflects immediately. No `onError` toast: every
 * `tauriIntegrations.*` call routes through `call()`, which surfaces + reports
 * the failure once.
 */
export function useAgentGrantToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, toolkit, active }: ToggleVars) => {
      const key = queryKeys.agentGrants(agentId);
      // Freshest cache value (includes this change's own optimistic update):
      // never send a set fabricated from a stale snapshot.
      const current = qc.getQueryData<string[] | null>(key);
      // Grants unsupported (host answered 404 → cached null): a defensive
      // no-op, never a PUT that fabricates a set the host has no route for.
      if (current === null) return Promise.resolve();
      const change: GrantChange = { toolkit, op: active ? "add" : "remove" };
      return tauriIntegrations.setGrants(
        agentId,
        applyGrantChange(current ?? [], change),
      );
    },
    onMutate: async ({ agentId, toolkit, active }) => {
      const key = queryKeys.agentGrants(agentId);
      await qc.cancelQueries({ queryKey: key });
      const change: GrantChange = { toolkit, op: active ? "add" : "remove" };
      qc.setQueryData<string[] | null>(key, (prev) =>
        applyGrantChangeNullable(prev === undefined ? [] : prev, change),
      );
    },
    onError: (_err, { agentId, toolkit, active }) => {
      const key = queryKeys.agentGrants(agentId);
      const change: GrantChange = { toolkit, op: active ? "add" : "remove" };
      qc.setQueryData<string[] | null>(key, (prev) =>
        prev === null || prev === undefined
          ? (prev ?? null)
          : reverseGrantChange(prev, change),
      );
    },
    onSettled: (_data, _err, { agentId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.agentGrants(agentId) }),
  });
}
