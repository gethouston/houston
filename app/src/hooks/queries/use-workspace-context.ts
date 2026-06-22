import type { WorkspaceContext } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tauriWorkspaces } from "../../lib/tauri";

const key = (workspaceId: string) =>
  ["workspace-context", workspaceId] as const;

export function useWorkspaceContext(workspaceId: string | undefined) {
  return useQuery({
    queryKey: key(workspaceId ?? ""),
    queryFn: () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return tauriWorkspaces.getContext(workspaceId);
    },
    enabled: !!workspaceId,
  });
}

export function useSaveWorkspaceContext(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkspaceContext) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return tauriWorkspaces.setContext(workspaceId, body);
    },
    onSuccess: (data) => {
      if (workspaceId) qc.setQueryData(key(workspaceId), data);
    },
  });
}
