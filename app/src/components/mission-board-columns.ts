import type { KanbanColumnConfig } from "@houston-ai/board";

interface MissionBoardColumnLabels {
  running: string;
  needsYou: string;
  done: string;
  newMission: string;
}

/** Status → board section mapping. Single source of truth shared by the
 *  column builder and {@link missionColumnIdForStatus} (used by drag-and-drop
 *  + multi-select section logic without rebuilding columns). */
const COLUMN_STATUSES = {
  running: ["running"],
  needs_you: ["needs_you", "error"],
  done: ["done", "cancelled"],
} as const;

export function buildMissionBoardColumns(
  labels: MissionBoardColumnLabels,
  onNewMission: () => void,
): KanbanColumnConfig[] {
  return [
    {
      id: "running",
      label: labels.running,
      statuses: [...COLUMN_STATUSES.running],
      onAdd: onNewMission,
      addLabel: labels.newMission,
    },
    {
      id: "needs_you",
      label: labels.needsYou,
      statuses: [...COLUMN_STATUSES.needs_you],
    },
    { id: "done", label: labels.done, statuses: [...COLUMN_STATUSES.done] },
  ];
}

/** The board column id a mission status belongs to, or null when none (e.g.
 *  `archived`, which never appears on the active board). */
export function missionColumnIdForStatus(status: string): string | null {
  for (const [id, statuses] of Object.entries(COLUMN_STATUSES)) {
    if ((statuses as readonly string[]).includes(status)) return id;
  }
  return null;
}
