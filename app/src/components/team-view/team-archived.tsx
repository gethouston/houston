import { useCallback, useMemo } from "react";
import { useAllConversations } from "../../hooks/queries";
import type { BoardSurface } from "../../lib/board-surface-nav";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { MissionControlArchived } from "../board/mission-control-archived";
import { useBoardSurfaceOnNav } from "../board/use-board-surface-on-nav";
import { useAgentBoardScope } from "./use-agent-board-scope";

export function TeamArchived({
  agent,
  onShowActive,
}: {
  agent: Agent;
  onShowActive: () => void;
}) {
  const agents = useAgentStore((s) => s.agents);
  const openAgentView = useUIStore((s) => s.openAgentView);
  const scope = useAgentBoardScope(agent);
  const scopedAgents = useMemo(() => [agent], [agent]);
  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: rawConversations } = useAllConversations(rosterPaths);

  const show = useCallback(
    (surface: BoardSurface) => {
      if (surface === "archived") return;
      onShowActive();
    },
    [onShowActive],
  );
  useBoardSurfaceOnNav({ rows: rawConversations, show });

  const startNewMission = useCallback(() => {
    openAgentView(agent.id, "mission-control");
    onShowActive();
    setTimeout(() => useUIStore.getState().onStartMission?.(), 50);
  }, [agent.id, openAgentView, onShowActive]);
  const requestNewMission = useCallback(
    (open: boolean) => {
      if (open) startNewMission();
    },
    [startNewMission],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MissionControlArchived
        agents={agents}
        scope={scope}
        scopedAgents={scopedAgents}
        newMissionMenuOpen={false}
        onNewMissionMenuChange={requestNewMission}
        onNewMission={startNewMission}
        onShowActive={onShowActive}
      />
    </div>
  );
}
