import { initialsFor, type KanbanPerson } from "@houston-ai/board";
import { Avatar, AvatarFallback, AvatarImage, cn } from "@houston-ai/core";

/**
 * The per-agent board card icon: the working person's face (photo, or initials
 * when they have no avatar). A running mission keeps a blue glow ring so the
 * face reads as "active", consistent with the card's own running-glow treatment.
 * Used only on a single agent's board — Mission Control keeps the agent helmet.
 */
export function AgentCardPersonIcon({
  person,
  running = false,
}: {
  person: KanbanPerson;
  running?: boolean;
}) {
  return (
    <Avatar
      title={person.label}
      className={cn(
        "size-4",
        running &&
          "ring-2 ring-blue-500/50 ring-offset-1 ring-offset-background",
      )}
    >
      {person.imageUrl && (
        <AvatarImage
          src={person.imageUrl}
          alt={person.label}
          referrerPolicy="no-referrer"
        />
      )}
      <AvatarFallback className="text-[8px] font-medium">
        {initialsFor(person.label)}
      </AvatarFallback>
    </Avatar>
  );
}
