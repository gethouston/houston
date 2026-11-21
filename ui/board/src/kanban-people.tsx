import {
  AvatarGroup,
  AvatarGroupCount,
  cn,
  Popover,
  PopoverTrigger,
} from "@houston-ai/core";
import {
  FACE_SIZE,
  Face,
  type FaceSize,
  type KanbanPeopleSurface,
  RING_CHIP,
  RING_GROUP,
  TEXT_SIZE,
} from "./kanban-people-face";
import {
  CARD_PEOPLE_MAX,
  initialsFor,
  overflowCount,
  visiblePeople,
} from "./kanban-people-logic";
import { KanbanPeopleRoster } from "./kanban-people-roster";
import type { KanbanPerson } from "./types";

export type { KanbanPeopleSurface };
export { CARD_PEOPLE_MAX, initialsFor, overflowCount, visiblePeople };

export interface KanbanPeopleProps {
  people?: KanbanPerson[];
  max?: number;
  size?: FaceSize;
  surface?: KanbanPeopleSurface;
  label?: string;
  expandable?: boolean;
  expandLabel?: string;
  roster?: boolean;
  className?: string;
}

export function KanbanPeople({
  people,
  max = 3,
  size = "sm",
  surface = "input",
  label = "People",
  expandable = false,
  expandLabel,
  roster = false,
  className,
}: KanbanPeopleProps) {
  if (!people || people.length === 0) return null;

  const faces = visiblePeople(people, max);
  const extra = overflowCount(people, max);
  const faceSize = FACE_SIZE[size];
  const textSize = TEXT_SIZE[size];
  const chipClass = cn(
    faceSize,
    textSize,
    "font-semibold bg-person-overflow text-person-overflow-text",
    RING_CHIP[surface],
  );

  const stack = (
    <AvatarGroup
      role="group"
      aria-label={label}
      className={cn("-space-x-1.5", RING_GROUP[surface], className)}
    >
      {faces.map((person) => (
        <Face
          key={person.id}
          person={person}
          faceSize={faceSize}
          textSize={textSize}
          tooltip
        />
      ))}
      {extra > 0 &&
        (expandable ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={expandLabel ?? label}
                title={`+${extra}`}
                className={cn(
                  chipClass,
                  "relative flex shrink-0 items-center justify-center rounded-full ring-2 transition-opacity hover:opacity-80 cursor-pointer",
                )}
              >
                +{extra}
              </button>
            </PopoverTrigger>
            <KanbanPeopleRoster people={people} />
          </Popover>
        ) : (
          <AvatarGroupCount className={chipClass} title={`+${extra}`}>
            +{extra}
          </AvatarGroupCount>
        ))}
    </AvatarGroup>
  );
  if (!roster) return stack;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={expandLabel ?? label}
          className="flex shrink-0 items-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {stack}
        </button>
      </PopoverTrigger>
      <KanbanPeopleRoster people={people} />
    </Popover>
  );
}
