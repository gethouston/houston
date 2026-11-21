import type { WorkspaceContext } from "@houston/engine-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEngine } from "../../lib/engine";
import { queryKeys } from "../../lib/query-keys";
import { surfaceEngineError } from "../../lib/tauri";

type Slot = "workspace" | "user";

export function useWorkspaceContext(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workspaceContext(agentPath ?? ""),
    queryFn: (): Promise<WorkspaceContext> => {
      if (!agentPath) throw new Error("agentPath is required");
      return getEngine().getWorkspaceContext(agentPath);
    },
    enabled: !!agentPath,
  });
}

export function useSaveWorkspaceContext(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slot, content }: { slot: Slot; content: string }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return getEngine().setWorkspaceContextSlot(agentPath, slot, content);
    },
    onSuccess: (_res, { slot, content }) => {
      if (!agentPath) return;
      qc.setQueryData<WorkspaceContext>(
        queryKeys.workspaceContext(agentPath),
        (prev) => ({ workspace: "", user: "", ...prev, [slot]: content }),
      );
    },
    onError: (err, { slot }) => {
      void surfaceEngineError("set_workspace_context", err, { slot });
    },
  });
}
