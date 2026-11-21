import type { KanbanColumnConfig } from "@houston-ai/board";

interface MissionBoardColumnLabels {
  running: string;
  needsYou: string;
  done: string;
  newMission: string;
}

const COLUMN_STATUSES = {
  running: ["running"],
  needs_you: ["needs_you", "error"],
  done: ["done"],
} as const;

export const MISSION_APPROVE_STATUSES = [...COLUMN_STATUSES.needs_you];

export const MISSION_ARCHIVE_STATUSES = [...COLUMN_STATUSES.done];

export function buildMissionBoardColumns(
  labels: MissionBoardColumnLabels,
  onNewMission: (() => void) | null,
): KanbanColumnConfig[] {
  return [
    {
      id: "running",
      label: labels.running,
      statuses: [...COLUMN_STATUSES.running],
      ...(onNewMission && {
        onAdd: onNewMission,
        addLabel: labels.newMission,
      }),
    },
    {
      id: "needs_you",
      label: labels.needsYou,
      statuses: [...COLUMN_STATUSES.needs_you],
    },
    {
      id: "done",
      label: labels.done,
      statuses: [...COLUMN_STATUSES.done],
    },
  ];
}

export function missionColumnIdForStatus(status: string): string | null {
  for (const [id, statuses] of Object.entries(COLUMN_STATUSES)) {
    if ((statuses as readonly string[]).includes(status)) return id;
  }
  return null;
}
