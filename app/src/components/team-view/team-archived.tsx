import { useCallback, useMemo } from "react";
import { useAllConversations } from "../../hooks/queries";
import type { BoardSurface } from "../../lib/board-surface-nav";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { MissionControlArchived } from "../board/mission-control-archived";
import { useBoardSurfaceOnNav } from "../board/use-board-surface-on-nav";
import { useAgentBoardScope } from "./use-agent-board-scope";

/**
 * One employee's ARCHIVE: everything this employee has finished with.
 *
 * It is a MODE of the Tasks section, not a destination of its own. The active
 * board's toolbar carries an "Archived" button (`teamView.archive.open`) that
 * swaps this screen in, and this screen's toolbar carries "Back to tasks"
 * (`teamView.archive.back`) to swap it back out. `TeamMissionControl` owns the
 * flag both buttons flip, so the archive can hand the user back at any time by
 * calling `onShowActive` — which is exactly what a mission that turns out to be
 * ACTIVE does below.
 *
 * The one-sweep rule holds. It reads the SAME `all-conversations` query
 * every other Mission Control surface reads, over the FULL workspace roster,
 * and narrows what it renders through the shared `MissionControlScope`.
 */
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

  // A published target whose mission turns out to be ACTIVE belongs on the
  // active board, so this screen hands it over from the raw sweep rows.
  const show = useCallback(
    (surface: BoardSurface) => {
      if (surface === "archived") return;
      onShowActive();
    },
    [onShowActive],
  );
  useBoardSurfaceOnNav({ rows: rawConversations, show });

  // "New task" from the ARCHIVE means a new task, which is never an archived
  // one: it hands the user to the Tasks section with this employee's composer
  // opening there. One employee means the button never asks whose task.
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
        // Rendered by the toolbar, in the same slot the active board's person
        // filter takes, so both board sections read search, filter, action.
        newMissionMenuOpen={false}
        onNewMissionMenuChange={requestNewMission}
        onNewMission={startNewMission}
        onShowActive={onShowActive}
      />
    </div>
  );
}
