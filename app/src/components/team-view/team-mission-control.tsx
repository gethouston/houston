import { useState } from "react";
import type { TeamView } from "../../lib/teams-model";
import { useAgentStore } from "../../stores/agents";
import { MissionControlArchived } from "../board/mission-control-archived";
import { TeamMissionEmpty } from "./team-empty";
import { TeamMissionBoard } from "./team-mission-board";
import { useTeamBoardScope } from "./use-team-board-scope";

/**
 * A team's Mission Control section: the team's active board, its archive, or
 * the honest empty state when the team holds no agents. The three SWAP rather
 * than hide, exactly as the global Mission Control does, so only the surface on
 * screen runs its hooks and claims the shell detail panel.
 *
 * This is the ONE place that owns the roster and the scope for both boards: the
 * FULL workspace roster goes to whichever surface is up (so both read the
 * single warm `all-conversations` query, per the one-sweep rule) and the shared
 * `MissionControlScope` narrows what that surface renders.
 *
 * Mounted with the team's id as its key, so switching teams starts a clean
 * board instead of carrying the previous team's selection and mode across.
 */
export function TeamMissionControl({ team }: { team: TeamView }) {
  const [archived, setArchived] = useState(false);
  const agents = useAgentStore((s) => s.agents);
  // Before the empty-team return: hooks may not run conditionally.
  const scope = useTeamBoardScope(team);

  if (team.agents.length === 0) return <TeamMissionEmpty team={team} />;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {archived ? (
        <MissionControlArchived
          agents={agents}
          scope={scope}
          onShowActive={() => setArchived(false)}
        />
      ) : (
        <TeamMissionBoard
          agents={agents}
          scope={scope}
          onShowArchived={() => setArchived(true)}
        />
      )}
    </div>
  );
}
