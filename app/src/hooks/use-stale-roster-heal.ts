import { useEffect } from "react";
import { makeRosterHealer } from "../lib/agent-gone";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";

/**
 * When a mounted surface observes an agent-gone read (HOUSTON-APP-544 — the
 * roster still lists an agent the server says does not exist), silently
 * reload the current workspace's roster so the ghost agent disappears on its
 * own. Module-level healer so every mounted surface shares ONE in-flight
 * reload; see `makeRosterHealer` for why this cannot loop.
 */
const healRoster = makeRosterHealer((workspaceId) =>
  useAgentStore.getState().loadAgents(workspaceId, { silent: true }),
);

export function useStaleRosterHeal(agentGone: boolean): void {
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  useEffect(() => {
    void healRoster(workspaceId, agentGone);
  }, [workspaceId, agentGone]);
}
