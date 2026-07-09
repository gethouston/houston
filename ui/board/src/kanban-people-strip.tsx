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

/** The card's dedicated bottom people row: a full-width strip along the card's
 *  bottom edge, separated by a hairline, showing ALL contributors as a face
 *  stack (up to {@link STRIP_MAX}) with an expandable "+N" chip that reveals
 *  every remaining person. A thin layout wrapper around {@link KanbanPeople};
 *  renders nothing when the mission has no people. */
export function KanbanPeopleStrip({
  people,
  label,
  expandLabel,
}: KanbanPeopleStripProps) {
  if (!people || people.length === 0) return null;
  return (
    // Negative inline margins pull the hairline to the card's edges (the card
    // owns `p-3`); the row keeps its own horizontal padding so the faces align
    // with the card body.
    <div className="-mx-3 mt-2.5 border-t border-border/40 px-3 pt-2">
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
