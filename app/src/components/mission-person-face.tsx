import { initialsFor, type KanbanPerson } from "@houston-ai/board";
import { Avatar, AvatarFallback, AvatarImage, Button } from "@houston-ai/core";
import { ChevronDown, Users } from "lucide-react";
import type * as React from "react";

/** The minimal face shape both the trigger and the menu rows render. */
export type FilterFace = Pick<KanbanPerson, "label" | "imageUrl">;

/** A compact avatar face used in the person-filter trigger and menu rows. */
export function PersonFace({ person }: { person: FilterFace }) {
  return (
    <Avatar className="size-5">
      {person.imageUrl && (
        <AvatarImage
          src={person.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
        />
      )}
      <AvatarFallback className="text-[9px] font-medium">
        {initialsFor(person.label)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The person-filter trigger button, shared by the teaser and the real filter.
 * Shows the active face (or a generic Users glyph) plus, when expanded, the
 * active label and a chevron.
 *
 * Rendered under `<DropdownMenuTrigger asChild>`, so Radix's Slot injects the
 * open-toggle `onClick`, `ref`, and `aria-*` as props on THIS component — they
 * must be forwarded to the underlying `Button` (spread `...props`) or the menu
 * would never open.
 */
export function FilterTrigger({
  face,
  text,
  label,
  collapsed,
  ...props
}: {
  face: FilterFace | null;
  text: string;
  label: string;
  collapsed: boolean;
} & React.ComponentProps<typeof Button>) {
  const icon = face ? (
    <PersonFace person={face} />
  ) : (
    <Users className="size-4" />
  );
  if (collapsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        aria-label={label}
        {...props}
      >
        {icon}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      className="rounded-full gap-1.5"
      aria-label={label}
      {...props}
    >
      {icon}
      {text}
      <ChevronDown className="size-3.5 text-muted-foreground" />
    </Button>
  );
}
