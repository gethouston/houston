import { KanbanPeople } from "./kanban-people";
import { STRIP_MAX } from "./kanban-people-logic";
import type { KanbanPerson } from "./types";

export interface KanbanPeopleStripProps {
  people?: KanbanPerson[];
  /** Accessible group label for the face stack (English default "People"). */
  label?: string;
  /** Accessible label for the expandable "+N" chip (English default "All people"). */
  expandLabel?: string;
}

/** The card's dedicated bottom people row: showing ALL contributors as a face
 *  stack (up to {@link STRIP_MAX}) with an expandable "+N" chip that reveals
 *  every remaining person. Part of the card body (no separating hairline); the
 *  faces align with the card's content padding, flush with the title and
 *  description. A thin layout wrapper around {@link KanbanPeople}; renders
 *  nothing when the mission has no people. */
export function KanbanPeopleStrip({
  people,
  label,
  expandLabel,
}: KanbanPeopleStripProps) {
  if (!people || people.length === 0) return null;
  return (
    // A tight top gap keeps the strip part of the card body (no bleed, no
    // hairline); faces start at the card's content padding like every other row.
    <div className="mt-2">
      <KanbanPeople
        people={people}
        max={STRIP_MAX}
        size="sm"
        label={label}
        expandable
        expandLabel={expandLabel}
      />
    </div>
  );
}
