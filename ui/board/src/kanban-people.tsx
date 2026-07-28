import {
  AvatarGroup,
  AvatarGroupCount,
  cn,
  Popover,
  PopoverContent,
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
import type { KanbanPerson } from "./types";

export type { KanbanPeopleSurface };
// Re-export the pure, JSX-free helpers so consumers can import them from the
// component module too; they live in `kanban-people-logic.ts` so tests can run
// them under `node --experimental-strip-types` (which can't transform JSX).
export { CARD_PEOPLE_MAX, initialsFor, overflowCount, visiblePeople };

export interface KanbanPeopleProps {
  people?: KanbanPerson[];
  /** Max faces before collapsing into a "+N" chip. */
  max?: number;
  /** `sm` (~18px) matches dense card rows; `md` (~24px) suits the detail panel. */
  size?: FaceSize;
  /** Surface the stack is drawn on — decides the ring colour. Default `input`. */
  surface?: KanbanPeopleSurface;
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

/** An overlapping face stack: up to `max` avatars + a "+N" overflow chip.
 *  Props-only, i18n-agnostic (labels passed in). Renders nothing when empty.
 *  With `expandable`, the "+N" chip opens a popover of every person. */
export function KanbanPeople({
  people,
  max = 3,
  size = "sm",
  surface = "input",
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
  // The overflow chip is a SOLID fill with high-contrast text (semibold), not
  // the translucent `bg-chip-subtle` it used to wear — that read as an empty
  // hole in the stack over a busy card.
  const chipClass = cn(
    faceSize,
    textSize,
    "font-semibold bg-person-overflow text-person-overflow-text",
    RING_CHIP[surface],
  );

  return (
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
                // The card behind this chip is itself clickable — don't let the
                // popover toggle bubble up and select the mission.
                onClick={(e) => e.stopPropagation()}
                aria-label={expandLabel ?? label}
                title={`+${extra}`}
                className={cn(
                  chipClass,
                  // Hover dims rather than re-tinting: the fill is a solid
                  // token whose "one step darker" differs per theme, and
                  // opacity reads identically in both.
                  "relative flex shrink-0 items-center justify-center rounded-full ring-2 transition-opacity hover:opacity-80 cursor-pointer",
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
          </Popover>
        ) : (
          <AvatarGroupCount className={chipClass} title={`+${extra}`}>
            +{extra}
          </AvatarGroupCount>
        ))}
    </AvatarGroup>
  );
}
