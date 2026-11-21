import type { KanbanItem } from "@houston-ai/board";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { armMissionDoneCelebration } from "../../lib/mission-done-celebration";
import { ARCHIVED_STATUS, DONE_STATUS } from "../../lib/mission-selection";
import {
  deleteMission,
  editMission,
  moveFailure,
  renameFailure,
} from "./mission-writes";

export function useMissionCardWrites({
  agentPathOf,
  selectedId,
  setSelectedId,
}: {
  agentPathOf: (id: string) => string | undefined;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const qc = useQueryClient();

  const handleDelete = useCallback(
    (item: KanbanItem) => {
      const agentPath = agentPathOf(item.id);
      if (!agentPath) return;
      void deleteMission(qc, agentPath, item, "board");
      if (selectedId === item.id) setSelectedId(null);
    },
    [qc, agentPathOf, selectedId, setSelectedId],
  );

  const handleApprove = useCallback(
    (item: KanbanItem) => {
      const agentPath = agentPathOf(item.id);
      if (!agentPath) return;
      const celebrate = armMissionDoneCelebration(item, DONE_STATUS);
      void editMission(
        qc,
        agentPath,
        item,
        { status: DONE_STATUS },
        { command: "approve_mission", failure: moveFailure(item, "move") },
      );
      celebrate();
    },
    [qc, agentPathOf],
  );

  const handleArchive = useCallback(
    (item: KanbanItem) => {
      const agentPath = agentPathOf(item.id);
      if (!agentPath) return;
      void editMission(
        qc,
        agentPath,
        item,
        { status: ARCHIVED_STATUS },
        { command: "archive_mission", failure: moveFailure(item, "archive") },
      );
      if (selectedId === item.id) setSelectedId(null);
    },
    [qc, agentPathOf, selectedId, setSelectedId],
  );

  const handleRename = useCallback(
    (item: KanbanItem, newTitle: string) => {
      const agentPath = agentPathOf(item.id);
      if (!agentPath) return;
      void editMission(
        qc,
        agentPath,
        item,
        { title: newTitle },
        { command: "rename_mission", failure: renameFailure(item) },
      );
    },
    [qc, agentPathOf],
  );

  return { handleDelete, handleApprove, handleArchive, handleRename };
}
