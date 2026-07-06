import type { AgentSettings } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgentSettings } from "../../lib/tauri";

export { effectiveAllowlist } from "../../components/tabs/agent-integrations/model";

/**
 * Teams v2 only: this agent's settings — the allowed-toolkit ceilings (agent +
 * org) plus the caller's effective `access`. Gated on the `teams` capability
 * via `enabled`: a host that predates Teams has no settings route (or the
 * desktop/local engine throws), so the query stays idle there and the
 * Integrations tab renders exactly as it does today. On a Teams host the route
 * always answers for an assigned caller or owner, so no 404→null degradation is
 * needed here — feature detection is the `teams` flag, not a swallowed error.
 */
export function useAgentSettings(agentId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.agentSettings(agentId),
    queryFn: () => tauriAgentSettings.get(agentId),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Teams v2, agent-manager only: replace this agent's allowed-toolkit ceiling
 * (`null` = all allowed, `[]` = none). Optimistic — a single manager action, so
 * a whole-value swap with rollback on error is enough (no overlapping-toggle
 * race like the grant set has). The host prunes now-disallowed toolkits from
 * existing grants, so this also invalidates the agent's grant set to reflect the
 * server-side revocation. Carries no `onError` toast: the `tauriAgentSettings.*`
 * wrappers route through `call()`, which surfaces + reports the failure once
 * (adding one here would double-toast); the `onError` below only rolls the
 * optimistic value back.
 */
export function useSetAgentSettings(agentId: string) {
  const qc = useQueryClient();
  const key = queryKeys.agentSettings(agentId);
  return useMutation({
    mutationFn: (allowedToolkits: string[] | null) =>
      tauriAgentSettings.set(agentId, { allowedToolkits }),
    onMutate: async (allowedToolkits) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentSettings>(key);
      if (prev) {
        qc.setQueryData<AgentSettings>(key, { ...prev, allowedToolkits });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      // Restricting the ceiling prunes grants server-side (contract §5); refresh
      // this agent's grant set so the revocation shows without a remount.
      qc.invalidateQueries({ queryKey: queryKeys.agentGrants(agentId) });
    },
  });
}

/**
 * Teams v2, agent-manager only: replace this agent's AI-model ceiling
 * (`allowedModels`: `null` = every model allowed, `[]` = none) via the same
 * `setAgentSettings` PUT. Optimistic whole-value swap with rollback, mirroring
 * `useSetAgentSettings` — but models carry no server-side grant pruning, so this
 * only invalidates the agent's settings, not its grant set. No `onError` toast:
 * `tauriAgentSettings.set` routes through `call()`, which surfaces + reports the
 * failure once; `onError` here only rolls the optimistic value back.
 */
export function useSetAgentAllowedModels(agentId: string) {
  const qc = useQueryClient();
  const key = queryKeys.agentSettings(agentId);
  return useMutation({
    mutationFn: (allowedModels: string[] | null) =>
      tauriAgentSettings.set(agentId, { allowedModels }),
    onMutate: async (allowedModels) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AgentSettings>(key);
      if (prev) {
        qc.setQueryData<AgentSettings>(key, { ...prev, allowedModels });
      }
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });
}
