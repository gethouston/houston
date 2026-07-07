import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
  cn,
} from "@houston-ai/core";
import {
  initialsFor,
  overflowCount,
  visiblePeople,
} from "./kanban-people-logic";
import type { KanbanPerson } from "./types";

// Re-export the pure, JSX-free helpers so consumers can import them from the
// component module too; they live in `kanban-people-logic.ts` so tests can run
// them under `node --experimental-strip-types` (which can't transform JSX).
export { initialsFor, overflowCount, visiblePeople };

export interface KanbanPeopleProps {
  people?: KanbanPerson[];
  /** Max faces before collapsing into a "+N" chip. */
  max?: number;
  /** `sm` (~18px) matches dense card rows; `md` (~24px) suits the detail panel. */
  size?: "sm" | "md";
  /** Accessible group label (English default "People"). */
  label?: string;
  className?: string;
}

const FACE_SIZE: Record<NonNullable<KanbanPeopleProps["size"]>, string> = {
  sm: "size-[18px]",
  md: "size-6",
};

const TEXT_SIZE: Record<NonNullable<KanbanPeopleProps["size"]>, string> = {
  sm: "text-[9px]",
  md: "text-[10px]",
};

/** An overlapping face stack: up to `max` avatars + a "+N" overflow chip.
 *  Props-only, i18n-agnostic (labels passed in). Renders nothing when empty. */
export function KanbanPeople({
  people,
  max = 3,
  size = "sm",
  label = "People",
  className,
}: KanbanPeopleProps) {
  if (!people || people.length === 0) return null;

  const faces = visiblePeople(people, max);
  const extra = overflowCount(people, max);
  const faceSize = FACE_SIZE[size];
  const textSize = TEXT_SIZE[size];

  return (
    <AvatarGroup
      role="group"
      aria-label={label}
      className={cn("-space-x-1.5", className)}
    >
      {faces.map((person) => (
        <Avatar key={person.id} title={person.label} className={faceSize}>
          {person.imageUrl && (
            <AvatarImage
              src={person.imageUrl}
              alt={person.label}
              referrerPolicy="no-referrer"
            />
          )}
          <AvatarFallback className={cn(textSize, "font-medium")}>
            {initialsFor(person.label)}
          </AvatarFallback>
        </Avatar>
      ))}
      {extra > 0 && (
        <AvatarGroupCount
          className={cn(faceSize, textSize, "font-medium")}
          title={`+${extra}`}
        >
          +{extra}
        </AvatarGroupCount>
      )}
    </AvatarGroup>
  );
}
