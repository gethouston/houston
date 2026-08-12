import { useMemo } from "react";
import type { TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import type { MissionControlScope } from "../board/use-mc-scope";
import { teamFilterPath } from "./team-agent-filter-model";

/**
 * The `MissionControlScope` a team's boards share: its ACTIVE board and its
 * ARCHIVE both narrow through this one object.
 *
 * The one-sweep rule is why it exists. Every Mission Control surface is handed
 * the FULL workspace roster, so all of them read the single warm
 * `all-conversations` query; the scope only says which slice a board RENDERS.
 * Handing a surface just the team's agents mints a second query key, which
 * costs a second cross-agent fan-out (a pod-wake storm on cold agents),
 * cancels the pending global re-sweep whose roster string no longer matches,
 * and lets the team's narrow result seed the global board as placeholder data.
 *
 * It also owns the id-to-path translation: the store pins an agent **id** (the
 * sidebar sets it by clicking a row) while a board filters on a **folder
 * path** (the key every mission card carries). `teamFilterPath` is that one
 * direction, so the sidebar row and what the board shows are the same act.
 */
export function useTeamBoardScope(
  team: TeamView,
  agentFocusId?: string,
): MissionControlScope {
  const teamAgentFilter = useUIStore((s) => s.teamAgentFilter);
  return useTeamScope(team, agentFocusId ?? teamAgentFilter);
}

/**
 * The same scope over an arbitrary filter SOURCE.
 *
 * The board's source is the team-wide pin above. The ARCHIVE's is its own
 * `useState`, because a section's dropdown must not rewrite what the rail set
 * for the whole team (`team-agent-filter-capsule.tsx` says why). Everything
 * else — the one-sweep paths, the id/path translation — is identical, which is
 * exactly why it is one hook rather than two.
 */
export function useTeamScope(
  team: TeamView,
  filterAgentId: string | null,
): MissionControlScope {
  const teamAgents = team.agents;
  const scopePaths = useMemo(
    () => teamAgents.map((a) => a.folderPath),
    [teamAgents],
  );

  return useMemo(
    () => ({
      scopePaths,
      teamId: team.id,
      filterPath: teamFilterPath(teamAgents, filterAgentId),
    }),
    [scopePaths, team.id, teamAgents, filterAgentId],
  );
}
