import { useCallback, useMemo, useState } from "react";
import { useAllConversations } from "../../hooks/queries";
import type { BoardSurface } from "../../lib/board-surface-nav";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { MissionControlArchived } from "../board/mission-control-archived";
import { newMissionTarget } from "../board/new-mission-target";
import { useBoardSurfaceOnNav } from "../board/use-board-surface-on-nav";
import { TeamAgentFilterCapsule } from "./team-agent-filter-capsule";
import { sectionFilterAgent } from "./team-agent-filter-model";
import { TeamMissionEmpty } from "./team-empty";
import { useTeamScope } from "./use-team-board-scope";

/**
 * A team's ARCHIVED section: everything this team has finished with.
 *
 * It used to be a MODE of the Tasks section — a pill you pressed to swap the
 * board under you, and a labelled back button to swap it back. That made one
 * place behave like two, and the only thing on screen saying which of the two
 * you were looking at was chrome the board had to invent for itself. It is a
 * tab now, so the section row says where you are, going there is one click,
 * and coming back is the Tasks tab: no entry pill, no overflow entry, no back
 * button, no "· Archived" qualifier anywhere.
 *
 * The one-sweep rule is untouched. It reads the SAME `all-conversations` query
 * every other Mission Control surface reads, over the FULL workspace roster,
 * and narrows what it renders through the shared `MissionControlScope`
 * (`useTeamBoardScope`) — never a second key for the team's slice.
 */
export function TeamArchived({ team }: { team: TeamView }) {
  const agents = useAgentStore((s) => s.agents);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const teamAgentFilter = useUIStore((s) => s.teamAgentFilter);
  // This section's OWN filter, not the team-wide pin: narrowing a list of
  // finished work must not silently narrow the board the user goes back to
  // (`team-agent-filter-capsule.tsx` says why). It resets with the section,
  // which remounts per team because `TeamView` keys it on the team id.
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);
  // Before the empty-team early return: hooks may not run conditionally.
  const scope = useTeamScope(team, filterAgentId, setFilterAgentId);
  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: rawConversations } = useAllConversations(rosterPaths);

  // A published target whose mission turns out to be ACTIVE belongs on the
  // other section, so this one hands it over. Identical discipline to before —
  // the surface is decided from the RAW sweep rows and the owner claims it —
  // except that "show the other surface" is now a section change. It carries
  // the team-wide pin, which is the BOARD's and was never this section's to
  // change; this section's own filter stays here and dies with it.
  const show = useCallback(
    (surface: BoardSurface) => {
      if (surface === "archived") return;
      openTeamView(team.id, "mission-control", {
        agentFilter: teamAgentFilter,
      });
    },
    [openTeamView, team.id, teamAgentFilter],
  );
  useBoardSurfaceOnNav({ rows: rawConversations, show });

  // "New task" from the ARCHIVE means a new task, which is never an archived
  // one: it hands the user to the Tasks section with that agent's composer
  // opening there. The same target rule the board uses decides whether the
  // button asks at all — the archive's own filter answers it when set.
  const [newMissionMenuOpen, setNewMissionMenuOpen] = useState(false);
  const startNewMissionFor = useCallback(
    (agent: Agent) => {
      setNewMissionMenuOpen(false);
      openTeamView(team.id, "mission-control", { agentFilter: agent.id });
      setTimeout(() => useUIStore.getState().onStartMission?.(), 50);
    },
    [openTeamView, team.id],
  );
  const requestNewMission = useCallback(
    (open: boolean) => {
      if (!open) {
        setNewMissionMenuOpen(false);
        return;
      }
      const target = newMissionTarget(
        sectionFilterAgent(team.agents, filterAgentId),
        team.agents,
      );
      if (target.kind === "direct") {
        startNewMissionFor(target.agent);
        return;
      }
      setNewMissionMenuOpen(true);
    },
    [team.agents, filterAgentId, startNewMissionFor],
  );

  if (team.agents.length === 0) return <TeamMissionEmpty team={team} />;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MissionControlArchived
        agents={agents}
        scope={scope}
        scopedAgents={team.agents}
        // Rendered by the toolbar, in the same slot the active board's person
        // filter takes, so both board sections read search, filter, action.
        agentFilter={
          <TeamAgentFilterCapsule
            agents={team.agents}
            selectedAgentId={filterAgentId}
            onSelect={setFilterAgentId}
          />
        }
        newMissionMenuOpen={newMissionMenuOpen}
        onNewMissionMenuChange={requestNewMission}
        onNewMission={startNewMissionFor}
        onShowActive={() =>
          openTeamView(team.id, "mission-control", {
            agentFilter: teamAgentFilter,
          })
        }
      />
    </div>
  );
}
