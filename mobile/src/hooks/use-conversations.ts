// List conversations (missions) across every agent in the current workspace.
// Mobile shows a unified feed grouped by status, not per-agent.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getEngine, isEngineReady } from "../lib/engine";
import { useAgents, useWorkspaces } from "./use-agents";

export function useCurrentWorkspace() {
  const { data: workspaces } = useWorkspaces();
  // v1 policy: first workspace. Multi-workspace switcher ships later.
  return workspaces?.[0] ?? null;
}

export interface ConversationsState {
  /** True until the upstream workspaces + agents queries have settled. */
  initializing: boolean;
  /** Set when any step in the chain failed. */
  error: Error | null;
  isFetching: boolean;
  conversations: ReturnType<
    typeof useQuery<
      Awaited<ReturnType<ReturnType<typeof getEngine>["listAllConversations"]>>
    >
  >;
}

export function useAllConversations() {
  const wsQuery = useWorkspaces();
  const ws = wsQuery.data?.[0] ?? null;
  const agentsQuery = useAgents(ws?.id ?? null);

  const agentPaths = useMemo(
    () => (agentsQuery.data ?? []).map((a) => a.folderPath),
    [agentsQuery.data],
  );

  const conversations = useQuery({
    queryKey: ["conversations", ws?.id, agentPaths],
    enabled: isEngineReady() && agentPaths.length > 0,
    refetchOnWindowFocus: true,
    queryFn: async () => await getEngine().listAllConversations(agentPaths),
  });

  // Distinguish "still loading upstream" from "loaded but empty" so the
  // UI doesn't flash "No missions yet" while we're still fetching
  // workspaces/agents.
  const initializing =
    wsQuery.isLoading ||
    (!!ws && agentsQuery.isLoading) ||
    (agentPaths.length > 0 && conversations.isLoading);

  const error =
    wsQuery.error ?? agentsQuery.error ?? conversations.error ?? null;

  return {
    ...conversations,
    initializing,
    error: error as Error | null,
    isFetching:
      conversations.isFetching || wsQuery.isFetching || agentsQuery.isFetching,
  };
}
