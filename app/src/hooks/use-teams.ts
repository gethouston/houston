import { useMemo } from "react";
import { resolveTeams, type TeamView } from "../lib/teams-model.ts";
import { useAgentStore } from "../stores/agents.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useSidebarLayoutValue } from "./use-sidebar-layout.ts";

export function useTeams(): TeamView[] {
  const agents = useAgentStore((store) => store.agents);
  const workspaceId = useWorkspaceStore((store) => store.current?.id);
  const layout = useSidebarLayoutValue(workspaceId);
  return useMemo(() => resolveTeams(agents, layout), [agents, layout]);
}
