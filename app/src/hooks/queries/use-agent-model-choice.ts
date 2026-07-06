import type { AgentModelChoice } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgentModelChoice } from "../../lib/tauri";

/**
 * Teams v2: the ACTING user's model choice for one shared agent plus the agent's
 * effective `allowedModels` ceiling (`GET /agents/:slug/model-choice`). In
 * multiplayer the composer's model picker reads THIS (the member's personal
 * per-agent pick), not the shared agent config, and offers only the pickable set
 * the ceiling allows. Gated on the `teams` capability via `enabled`: a host that
 * predates Teams 404s the route and the engine-client degrades that to `null`,
 * so the query is left idle there and the composer keeps its single-player
 * shared-config behavior. One choice per (agent, user); keyed by agent id.
 */
export function useAgentModelChoice(agentId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.agentModelChoice(agentId),
    queryFn: () => tauriAgentModelChoice.get(agentId),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Teams v2: set the ACTING user's model choice for this agent. The gateway
 * validates the model is within the agent's `allowedModels` ceiling (else it
 * answers `model_not_allowed`) and clamps the acting user's turns to it. No
 * `onError` toast: `tauriAgentModelChoice.set` routes through `call()`, which
 * surfaces + reports the failure once; adding one here would double-toast. On
 * success the choice query is invalidated so the picker reflects the new pick.
 */
export function useSetAgentModelChoice(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (choice: AgentModelChoice) =>
      tauriAgentModelChoice.set(agentId, choice),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: queryKeys.agentModelChoice(agentId),
      }),
  });
}
