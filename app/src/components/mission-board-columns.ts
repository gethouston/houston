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
      statuses: ["queued", "running"],
      onAdd: onNewMission,
      addLabel: labels.newMission,
    },
    {
      id: "needs_you",
      label: labels.needsYou,
      // `interrupted` belongs here: the user must Resume or Cancel before
      // anything else can happen. The card renders a Resume affordance so
      // the user can recover work the engine couldn't finish on its own.
      statuses: ["needs_you", "interrupted"],
    },
    {
      id: "done",
      label: labels.done,
      statuses: ["done", "cancelled", "error"],
    },
  ];
}
