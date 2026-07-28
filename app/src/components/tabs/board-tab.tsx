import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { MissionBoard } from "../board/mission-board";
import { useAgentBoardSource } from "../board/use-agent-board-source";
import ArchivedTab from "./archived-tab";

/**
 * A single agent's mission board. All the wiring lives in the shared
 * `<MissionBoard>`; this tab only builds the per-agent data source.
 */
export default function BoardTab({ agent, agentDef }: TabProps) {
  const mode = useUIStore((s) => s.agentBoardMode);
  const source = useAgentBoardSource(agent, agentDef);
  if (mode === "archived")
    return <ArchivedTab agent={agent} agentDef={agentDef} />;
  return (
    <div className="flex flex-col h-full">
      <MissionBoard source={source} />
    </div>
  );
}
