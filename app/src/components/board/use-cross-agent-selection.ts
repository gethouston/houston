import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { ARCHIVED_STATUS } from "../../lib/mission-selection";
import type { BoardSelectionModel } from "./board-selection-model";
import { groupIdsByAgent } from "./group-ids-by-agent";
import { deleteMissions, editMissions } from "./mission-writes";
import { useSelectionSet } from "./use-selection-set";

export function useCrossAgentSelection({
  paths,
  agentPathForId,
}: {
  paths: string[];
  agentPathForId: (id: string) => string | undefined;
}): BoardSelectionModel {
  const { selectedIds, toggle, selectAll, clear } = useSelectionSet();
  const qc = useQueryClient();

  const groups = useCallback(
    () => groupIdsByAgent(Array.from(selectedIds), agentPathForId),
    [selectedIds, agentPathForId],
  );

  const move = useCallback(
    (status: string) => {
      void editMissions(qc, groups(), paths, status, "move");
      clear();
    },
    [qc, groups, paths, clear],
  );

  const archive = useCallback(() => {
    void editMissions(qc, groups(), paths, ARCHIVED_STATUS, "archive");
    clear();
  }, [qc, groups, paths, clear]);

  const remove = useCallback(() => {
    void deleteMissions(qc, groups(), paths);
    clear();
  }, [qc, groups, paths, clear]);

  return { selectedIds, toggle, selectAll, clear, move, archive, remove };
}
