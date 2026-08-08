import { useCallback, useMemo, useState } from "react";
import { useAllConversations } from "../../hooks/queries";
import type { BoardSurface } from "../../lib/board-surface-nav";
import type { TeamView } from "../../lib/teams-model";
import { useAgentStore } from "../../stores/agents";
import { MissionControlArchived } from "../board/mission-control-archived";
import { useBoardSurfaceOnNav } from "../board/use-board-surface-on-nav";
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
  // The FULL roster's paths, so this is the one shared `all-conversations`
  // query both boards already read — the same key, no second fan-out (the
  // one-sweep rule). It is mounted here because the surface decision has to
  // happen ABOVE the two surfaces: whichever is up holds only its own half of
  // these rows.
  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: rawConversations } = useAllConversations(rosterPaths);
  // Which surface belongs on screen: the one a published nav names, and the
  // ACTIVE board whenever this section comes back on the glass.
  const show = useCallback(
    (surface: BoardSurface) => setArchived(surface === "archived"),
    [],
  );
  useBoardSurfaceOnNav({ rows: rawConversations, show });

  if (team.agents.length === 0) return <TeamMissionEmpty team={team} />;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {archived ? (
        <MissionControlArchived
          agents={agents}
          scope={scope}
          onShowActive={() => show("active")}
        />
      ) : (
        <TeamMissionBoard
          agents={agents}
          scope={scope}
          onShowArchived={() => show("archived")}
        />
      )}
    </div>
  );
}
