import { useEffect } from "react";
import { healStaleRoster } from "../lib/roster-heal";
import { useWorkspaceStore } from "../stores/workspaces";

export function useStaleRosterHeal(agentGone: boolean): void {
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  useEffect(() => {
    void healStaleRoster(workspaceId, agentGone);
  }, [workspaceId, agentGone]);
}
