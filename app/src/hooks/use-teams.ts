import { useMemo } from "react";
import { hasAgentTeams, isPersonalSpace } from "../lib/org-roles.ts";
import { personalDefaultTeamSeed } from "../lib/server-teams-model.ts";
import { isTeamWorkspace } from "../lib/space-id.ts";
import { resolveTeamsForBackend } from "../lib/teams-backend.ts";
import type { TeamView } from "../lib/teams-model.ts";
import { useAgentStore } from "../stores/agents.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useAgentTeams } from "./queries/use-agent-teams.ts";
import { useCapabilities } from "./use-capabilities.ts";
import { useSession } from "./use-session.ts";
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
 * `lib/current-teams.ts`'s store-free `currentTeams()`.
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
  // The gateway mints a personal space's default team from the CALLER's
  // identity, not the space's display name, so the seed to compare against
  // branches on the space kind.
  const { data: session } = useSession();
  const defaultTeamSeedName = isPersonalSpace(
    capabilities,
    isTeamWorkspace(workspace?.id ?? ""),
  )
    ? personalDefaultTeamSeed(session)
    : workspaceName;
  return useMemo(
    () =>
      resolveTeamsForBackend({
        agents,
        defaultTeamSeedName,
        layout,
        serverBacked,
        serverTeams,
        workspaceName,
      }),
    [
      agents,
      defaultTeamSeedName,
      layout,
      serverBacked,
      serverTeams,
      workspaceName,
    ],
  );
}
