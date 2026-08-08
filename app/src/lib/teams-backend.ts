/**
 * The ONE branch between Houston's two team backends, pure and store-free.
 *
 * `hooks/use-teams.ts` (the React seam) and `lib/open-agent.ts`'s store-free
 * `currentTeams()` both resolve through this module, so the rail and a keyboard
 * shortcut can never disagree about which team holds an agent. It lives in
 * `lib/` beside the two models it dispatches to — `teams-model.ts` (local) and
 * `server-teams-model.ts` (server) — rather than inside the hook, because a
 * pure rule that a lib has to reach for does not belong in the hooks layer.
 */

import type { AgentTeam, SidebarLayout } from "@houston-ai/engine-client";
import { resolveServerTeams } from "./server-teams-model.ts";
import { resolveTeams, type TeamView } from "./teams-model.ts";
import type { Agent } from "./types.ts";

/** Everything the two backends resolve from. */
export interface TeamsBackendInput {
  /** `hasAgentTeams(capabilities)` — the host owns the teams. */
  serverBacked: boolean;
  /** The server's teams, `undefined` until the first read lands. */
  serverTeams: AgentTeam[] | undefined;
  agents: Agent[];
  /** Server-backed, this is only the per-user ORDERING OVERLAY (agent order
   *  inside a team + the collapsed flag), keyed by server team id. */
  layout: SidebarLayout;
  /** The default team's name on the LOCAL backend, where the client names it.
   *  Unused server-backed: the server names its own default team. */
  workspaceName: string | undefined;
}

/**
 * The ONE branch between the two team backends, pure so both `useTeams()` and
 * the store-free reader in `lib/open-agent.ts` ask the identical question. Two
 * copies of this rule would let the rail and a keyboard shortcut disagree about
 * which team holds an agent.
 *
 * Server-backed with the first read still in flight resolves to NO teams, which
 * is the honest answer: the rail shows nothing rather than a local grouping the
 * host does not have, and it is exactly what `blockedTeamView` reads. TanStack
 * keeps the last good data across refetches and errors, so this is a
 * first-load-only state.
 */
export function resolveTeamsForBackend(input: TeamsBackendInput): TeamView[] {
  const { agents, layout, serverBacked, serverTeams, workspaceName } = input;
  if (serverBacked) {
    return serverTeams === undefined
      ? []
      : resolveServerTeams(serverTeams, agents, layout);
  }
  return workspaceName === undefined
    ? []
    : resolveTeams(agents, layout, workspaceName);
}
