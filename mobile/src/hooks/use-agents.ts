// TanStack Query wrappers for listWorkspaces / listAgents.
// `refetchOnWindowFocus: true` so that when the user foregrounds the
// PWA after a lock-screen interval the list refreshes on its own.

import { useQuery } from "@tanstack/react-query";
import { getEngine, isEngineReady } from "../lib/engine";

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    enabled: isEngineReady(),
    refetchOnWindowFocus: true,
    queryFn: async () => await getEngine().listWorkspaces(),
  });
}

export function useAgents(workspaceId: string | null) {
  return useQuery({
    queryKey: ["agents", workspaceId],
    enabled: isEngineReady() && !!workspaceId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId required");
      return getEngine().listAgents(workspaceId);
    },
  });
}
