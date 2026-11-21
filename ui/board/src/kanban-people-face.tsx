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

export type KanbanPeopleSurface = "input" | "background";

export const FACE_SIZE = {
  sm: "size-[18px]",
  md: "size-6",
} as const;

export const TEXT_SIZE = {
  sm: "text-[9px]",
  md: "text-[10px]",
} as const;

export type FaceSize = keyof typeof FACE_SIZE;

export const RING_GROUP: Record<KanbanPeopleSurface, string> = {
  input: "*:data-[slot=avatar]:ring-input",
  background:
    "*:data-[slot=avatar]:ring-background dark:*:data-[slot=avatar]:ring-input",
};

export const RING_CHIP: Record<KanbanPeopleSurface, string> = {
  input: "ring-input",
  background: "ring-background dark:ring-input",
};

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
