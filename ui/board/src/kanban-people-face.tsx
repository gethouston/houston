import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { initialsFor } from "./kanban-people-logic";
import { personToneClass } from "./kanban-people-tone";
import type { KanbanPerson } from "./types";

/** The surface a face stack sits on. The 2px ring around every face is painted
 *  in that surface's colour, so an overlapped face reads as a CUTOUT rather
 *  than a halo band. `input` (the default) is the card tier; `background` is
 *  the floating screen the mission detail panel wears. */
export type KanbanPeopleSurface = "input" | "background";

/** Face diameters. `sm` (18px) matches dense card rows; `md` (24px) the panel. */
export const FACE_SIZE = {
  sm: "size-[18px]",
  md: "size-6",
} as const;

export const TEXT_SIZE = {
  sm: "text-[9px]",
  md: "text-[10px]",
} as const;

export type FaceSize = keyof typeof FACE_SIZE;

// Ring overrides, spelled out per surface as whole literal class strings so
// Tailwind's source scanner sees them (a template-built class would never be
// generated). The FACE ring has to be set at the GROUP level: AvatarGroup
// styles its children through `*:data-[slot=avatar]:ring-*`, which outranks any
// class on the avatar itself. `background` is glass in dark mode — a
// translucent ring would let the neighbouring face bleed through, the very
// artifact the ring exists to prevent — so dark falls back to the solid tone
// that glass composites to over the canvas.
export const RING_GROUP: Record<KanbanPeopleSurface, string> = {
  input: "*:data-[slot=avatar]:ring-input",
  background:
    "*:data-[slot=avatar]:ring-background dark:*:data-[slot=avatar]:ring-input",
};

export const RING_CHIP: Record<KanbanPeopleSurface, string> = {
  input: "ring-input",
  background: "ring-background dark:ring-input",
};

/** A single avatar face: image when known, initials fallback otherwise. Shared
 *  by the overlapping stack and the expansion popover so both read identically.
 *  With `tooltip`, hovering the face shows the person's display name via the
 *  app's Tooltip primitive (the stack has no visible label of its own); the
 *  popover passes it off since it already lists the name in text beside each
 *  face. Off `tooltip`, the native `title` still carries the name.
 *
 *  The initials fallback is OPAQUE — a desaturated person tone picked from the
 *  person's stable id — because the inherited `bg-chip-subtle` is ~96%
 *  transparent: the face underneath and the card's own text used to show
 *  straight through the letters. */
export function Face({
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
    <Avatar
      // Re-assert the slot marker EXPLICITLY. `TooltipTrigger asChild` renders
      // a Radix Slot that injects `data-slot="tooltip-trigger"` into this
      // element's props, and `Avatar` spreads incoming props AFTER its own
      // `data-slot`, so the marker was being overwritten — which silently
      // killed the whole `AvatarGroup` ring contract
      // (`*:data-[slot=avatar]:ring-2`): the faces in the stack rendered with
      // NO ring and simply collided edge to edge. Passing it here makes it a
      // CHILD prop, which wins the Slot merge.
      data-slot="avatar"
      title={tooltip ? undefined : person.label}
      className={faceSize}
    >
      {person.imageUrl && (
        <AvatarImage
          src={person.imageUrl}
          alt={person.label}
          referrerPolicy="no-referrer"
        />
      )}
      <AvatarFallback
        className={cn(
          textSize,
          "font-medium text-person-initials",
          personToneClass(person.id),
        )}
      >
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
