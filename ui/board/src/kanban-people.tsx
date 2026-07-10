import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import {
  CARD_PEOPLE_MAX,
  initialsFor,
  overflowCount,
  visiblePeople,
} from "./kanban-people-logic";
import type { KanbanPerson } from "./types";

// Re-export the pure, JSX-free helpers so consumers can import them from the
// component module too; they live in `kanban-people-logic.ts` so tests can run
// them under `node --experimental-strip-types` (which can't transform JSX).
export { CARD_PEOPLE_MAX, initialsFor, overflowCount, visiblePeople };

export interface KanbanPeopleProps {
  people?: KanbanPerson[];
  /** Max faces before collapsing into a "+N" chip. */
  max?: number;
  /** `sm` (~18px) matches dense card rows; `md` (~24px) suits the detail panel. */
  size?: "sm" | "md";
  /** Accessible group label (English default "People"). */
  label?: string;
  /** When set, the "+N" overflow chip becomes a button that opens a popover
   *  listing EVERY person (face + label) so no contributor is unreachable. Off
   *  by default (a static, non-interactive chip). */
  expandable?: boolean;
  /** Accessible label for the expandable "+N" trigger / popover (e.g. "All
   *  people"). Only used when `expandable`. */
  expandLabel?: string;
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

/** A single avatar face: image when known, initials fallback otherwise. Shared
 *  by the overlapping stack and the expansion popover so both read identically.
 *  With `tooltip`, hovering the face shows the person's display name via the
 *  app's Tooltip primitive (the stack has no visible label of its own); the
 *  popover passes it off since it already lists the name in text beside each
 *  face. Off `tooltip`, the native `title` still carries the name. */
function Face({
  person,
  faceSize,
  textSize,
  tooltip = false,
}: {
  person: KanbanPerson;
  faceSize: string;
  textSize: string;
  tooltip?: boolean;
}) {
  const avatar = (
    <Avatar title={tooltip ? undefined : person.label} className={faceSize}>
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
  );
  if (!tooltip) return avatar;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent side="top">{person.label}</TooltipContent>
    </Tooltip>
  );
}

/** An overlapping face stack: up to `max` avatars + a "+N" overflow chip.
 *  Props-only, i18n-agnostic (labels passed in). Renders nothing when empty.
 *  With `expandable`, the "+N" chip opens a popover of every person. */
export function KanbanPeople({
  people,
  max = 3,
  size = "sm",
  label = "People",
  expandable = false,
  expandLabel,
  className,
}: KanbanPeopleProps) {
  if (!people || people.length === 0) return null;

  const faces = visiblePeople(people, max);
  const extra = overflowCount(people, max);
  const faceSize = FACE_SIZE[size];
  const textSize = TEXT_SIZE[size];
  const chipClass = cn(faceSize, textSize, "font-medium");

  return (
    <AvatarGroup
      role="group"
      aria-label={label}
      className={cn("-space-x-1.5", className)}
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
                // The card behind this chip is itself clickable — don't let the
                // popover toggle bubble up and select the mission.
                onClick={(e) => e.stopPropagation()}
                aria-label={expandLabel ?? label}
                title={`+${extra}`}
                className={cn(
                  chipClass,
                  "relative flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-2 ring-background transition-colors hover:bg-muted-foreground/20 cursor-pointer",
                )}
              >
                +{extra}
              </button>
            </PopoverTrigger>
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
                      faceSize="size-6"
                      textSize="text-[10px]"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {person.label}
                    </span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <AvatarGroupCount className={chipClass} title={`+${extra}`}>
            +{extra}
          </AvatarGroupCount>
        ))}
    </AvatarGroup>
  );
}
