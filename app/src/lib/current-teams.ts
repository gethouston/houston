/**
 * The teams as they are RIGHT NOW, outside React.
 *
 * The store-free twin of `useTeams()` (`hooks/use-teams.ts`): the same inputs
 * (the capability, the server's teams, the agents, the cached sidebar layout,
 * the workspace name), read from the stores and the query cache, branched by
 * the very same `resolveTeamsForBackend`. A keyboard shortcut, a notification
 * handler or a toast action can therefore never resolve different teams than
 * the rail is drawing.
 *
 * Its own module because BOTH imperative navigators need it — `open-agent.ts`
 * ("take me to agent X's thing") and `home-nav.ts` ("take me home") — and one
 * importing the other for it would close a cycle.
 */

import type { Capabilities } from "@houston-ai/engine-client";
import { getCurrentAgentTeams } from "../hooks/queries/use-agent-teams.ts";
import { getCurrentSidebarLayout } from "../hooks/use-sidebar-layout.ts";
import { useAgentStore } from "../stores/agents.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import type { Session } from "./identity";
import { hasAgentTeams, isPersonalSpace } from "./org-roles.ts";
import { queryClient } from "./query-client.ts";
import { queryKeys } from "./query-keys.ts";
import { personalDefaultTeamSeed } from "./server-teams-model.ts";
import { isTeamWorkspace } from "./space-id.ts";
import { resolveTeamsForBackend } from "./teams-backend.ts";
import type { TeamView } from "./teams-model.ts";

export function currentTeams(): TeamView[] {
  const workspace = useWorkspaceStore.getState().current;
  if (!workspace) return [];
  const capabilities = queryClient.getQueryData<Capabilities>(
    queryKeys.capabilities(),
  );
  // Same seed rule as `useTeams`: the gateway mints a personal space's default
  // team from the caller's identity, a team space's from the org name.
  const session = queryClient.getQueryData<Session | null>(queryKeys.session());
  return resolveTeamsForBackend({
    agents: useAgentStore.getState().agents,
    defaultTeamSeedName: isPersonalSpace(
      capabilities,
      isTeamWorkspace(workspace.id),
    )
      ? personalDefaultTeamSeed(session)
      : workspace.name,
    layout: getCurrentSidebarLayout(workspace.id),
    serverBacked: hasAgentTeams(capabilities),
    serverTeams: getCurrentAgentTeams(),
    workspaceName: workspace.name,
  });
}
