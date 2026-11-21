import { useMemo } from "react";
import type { Agent } from "../../lib/types";
import type { MissionControlScope } from "../board/use-mc-scope";

export function useAgentBoardScope(agent: Agent): MissionControlScope {
  const { id, folderPath } = agent;
  return useMemo(
    () => ({ scopePaths: [folderPath], teamId: id, filterPath: folderPath }),
    [id, folderPath],
  );
}
