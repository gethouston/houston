import {
  initialsFor,
  type KanbanPerson,
  personToneClass,
} from "@houston-ai/board";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
} from "@houston-ai/core";
import { ChevronDown, Users } from "lucide-react";
import type * as React from "react";

export type FilterFace = Pick<KanbanPerson, "label" | "imageUrl"> &
  Partial<Pick<KanbanPerson, "id">>;

export function PersonFace({
  person,
  className,
  initialsClassName,
}: {
  person: FilterFace;
  className?: string;
  initialsClassName?: string;
}) {
  return (
    <Avatar className={cn("size-5", className)}>
      {person.imageUrl && (
        <AvatarImage
          src={person.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
        />
      )}
      <AvatarFallback
        className={cn(
          "text-[9px] font-medium",
          person.id && cn(personToneClass(person.id), "text-person-initials"),
          initialsClassName,
        )}
      >
        {initialsFor(person.label)}
      </AvatarFallback>
    </Avatar>
  );
}

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
      <ChevronDown className="size-3.5 text-ink-muted" />
    </Button>
  );
}
