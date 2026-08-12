import { useEffect } from "react";
import { healStaleRoster } from "../lib/roster-heal";
import { useWorkspaceStore } from "../stores/workspaces";

/**
 * When a mounted surface observes an agent-gone read (HOUSTON-APP-544 — the
 * roster still lists an agent the server says does not exist), silently
 * reload the current workspace's roster so the ghost agent disappears on its
 * own. Delegates to the ONE shared healer (`lib/roster-heal.ts`) so every
 * mounted surface AND the engine-call layer share a single in-flight reload;
 * see `makeRosterHealer` for why this cannot loop.
 */
export function useStaleRosterHeal(agentGone: boolean): void {
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  useEffect(() => {
    void healStaleRoster(workspaceId, agentGone);
  }, [workspaceId, agentGone]);
}
