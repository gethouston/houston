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
  done: ["done"],
} as const;

/** Statuses whose cards offer the "Move to done" checkmark. It is exactly the
 *  Needs you column's contents: the engine parks finished work there whether
 *  the turn settled cleanly (`needs_you`) or blew up (`error`), and only the
 *  user moves a mission on to Done, so an errored mission needs the same
 *  one-click finish as any other. */
export const MISSION_APPROVE_STATUSES = [...COLUMN_STATUSES.needs_you];

/** Statuses whose cards offer the one-click archive box. It is exactly the
 *  Done column's contents: once the user has signed a mission off, the only
 *  move left is filing it away, so the card that ends the board's loop gets the
 *  same single click that got it there. Deliberately disjoint from
 *  {@link MISSION_APPROVE_STATUSES} — a mission still waiting on the user must
 *  be dealt with before it can be hidden. */
export const MISSION_ARCHIVE_STATUSES = [...COLUMN_STATUSES.done];

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
