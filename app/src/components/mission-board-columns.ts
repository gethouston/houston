import type { KanbanColumnConfig } from "@houston-ai/board";

interface MissionBoardColumnLabels {
  running: string;
  needsYou: string;
  done: string;
  newMission: string;
}

export function buildMissionBoardColumns(
  labels: MissionBoardColumnLabels,
  onNewMission: () => void,
): KanbanColumnConfig[] {
  return [
    {
      id: "running",
      label: labels.running,
      statuses: ["running"],
      onAdd: onNewMission,
      addLabel: labels.newMission,
    },
    {
      id: "needs_you",
      label: labels.needsYou,
      statuses: ["needs_you", "error"],
    },
    { id: "done", label: labels.done, statuses: ["done", "cancelled"] },
  ];
}
