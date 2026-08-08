import { useMemo } from "react";
import { hasAgentTeams } from "../lib/org-roles.ts";
import { resolveTeamsForBackend } from "../lib/teams-backend.ts";
import type { TeamView } from "../lib/teams-model.ts";
import { useAgentStore } from "../stores/agents.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useAgentTeams } from "./queries/use-agent-teams.ts";
import { useCapabilities } from "./use-capabilities.ts";
import { useSidebarLayoutValue } from "./use-sidebar-layout.ts";

/**
 * The active space's teams. The ONE place the inputs are composed, so the
 * sidebar's team rows and the team view can never disagree about what a team
 * contains, whichever backend answers:
 *
 * - `agentTeams` capability ON (C13): the teams and their rosters are the
 *   SERVER's; the stored sidebar layout degrades to a per-user ordering overlay
 *   keyed by server team id (still stored per workspace, hence the id below).
 * - capability OFF: the local backend, unchanged — named sidebar groups plus
 *   the trailing default team wearing the workspace's own name. With no
 *   workspace there are no teams at all, which is what sends an open team view
 *   back to the dashboard.
 *
 * This hook is the SEAM; the branch itself is the pure
 * {@link resolveTeamsForBackend} in `lib/teams-backend.ts`, shared with
 * `lib/open-agent.ts`'s store-free `currentTeams()`.
 *
 * Memoized because consumers derive memoized structures from the result; a
 * fresh array every render would invalidate all of them.
 */
export function useTeams(): TeamView[] {
  const agents = useAgentStore((s) => s.agents);
  const workspace = useWorkspaceStore((s) => s.current);
  const layout = useSidebarLayoutValue(workspace?.id);
  const { capabilities } = useCapabilities();
  const serverBacked = hasAgentTeams(capabilities);
  const { teams: serverTeams } = useAgentTeams(serverBacked);
  const workspaceName = workspace?.name;
  return useMemo(
    () =>
      resolveTeamsForBackend({
        agents,
        layout,
        serverBacked,
        serverTeams,
        workspaceName,
      }),
    [agents, layout, serverBacked, serverTeams, workspaceName],
  );
}
