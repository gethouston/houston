import { PopoverContent } from "@houston-ai/core";
import { FACE_SIZE, Face, TEXT_SIZE } from "./kanban-people-face";
import type { KanbanPerson } from "./types";

/** The popover body listing EVERY person on a face stack (face + label), so
 *  nobody behind a "+N" chip or a hover-only tooltip is unreachable. Shared by
 *  the chip trigger and the whole-stack trigger so both open the same list. */
export function KanbanPeopleRoster({ people }: { people: KanbanPerson[] }) {
  return (
    <PopoverContent
      align="start"
      onClick={(e) => e.stopPropagation()}
      className="w-56 p-1"
    >
      <div className="max-h-64 overflow-y-auto">
        {people.map((person) => (
          <div
            key={person.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5"
          >
            <Face
              person={person}
              faceSize={FACE_SIZE.md}
              textSize={TEXT_SIZE.md}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {person.label}
            </span>
          </div>
        ))}
      </div>
    </PopoverContent>
  );
}
