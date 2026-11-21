import type {
  AgentMoveStart,
  AgentMoveStatus,
  OrgsList,
} from "@houston/engine-adapter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { isExpectedMoveAnswer } from "../../lib/share-error";
import { tauriOrg } from "../../lib/tauri";

export function useOrgs(
  enabled: boolean,
  options?: { refetchOnWindowFocus?: boolean },
) {
  return useQuery<OrgsList>({
    queryKey: queryKeys.orgs(),
    queryFn: () => tauriOrg.listOrgs(),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
  });
}

export function useMoveAgent() {
  return useMutation<
    AgentMoveStart,
    unknown,
    { agentSlugOrId: string; toSlug: string }
  >({
    mutationFn: ({ agentSlugOrId, toSlug }) =>
      tauriOrg.moveAgent(agentSlugOrId, toSlug, {
        silence: isExpectedMoveAnswer,
      }),
  });
}

export function useAgentMoveStatus(
  agentSlugOrId: string,
  moveId: string | null,
  enabled: boolean,
) {
  return useQuery<AgentMoveStatus>({
    queryKey: queryKeys.agentMove(agentSlugOrId, moveId ?? ""),
    queryFn: () => tauriOrg.moveStatus(agentSlugOrId, moveId ?? ""),
    enabled: enabled && moveId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "done" || status === "failed" ? false : 1500;
    },
    staleTime: 0,
    gcTime: 0,
  });
}
