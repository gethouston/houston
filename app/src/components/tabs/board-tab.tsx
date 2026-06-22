import type { TabProps } from "../../lib/types";
import { MissionBoard } from "../board/mission-board";
import { useAgentBoardSource } from "../board/use-agent-board-source";

/**
 * A single agent's mission board. All the wiring lives in the shared
 * `<MissionBoard>`; this tab only builds the per-agent data source.
 */
export default function BoardTab({ agent, agentDef }: TabProps) {
  const source = useAgentBoardSource(agent, agentDef);
  return (
    <div className="flex flex-col h-full">
      <MissionBoard source={source} />
    </div>
  );
}
