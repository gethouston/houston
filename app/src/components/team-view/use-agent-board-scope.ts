import { useMemo } from "react";
import type { Agent } from "../../lib/types";
import type { MissionControlScope } from "../board/use-mc-scope";

/**
 * One employee's scope over the shared workspace conversation sweep: boards
 * read the full roster once and render only this employee's folder path. The
 * draft scope is keyed on the employee, so each keeps its own unsent draft.
 */
export function useAgentBoardScope(agent: Agent): MissionControlScope {
  const { id, folderPath } = agent;
  return useMemo(
    () => ({ scopePaths: [folderPath], teamId: id, filterPath: folderPath }),
    [id, folderPath],
  );
}
