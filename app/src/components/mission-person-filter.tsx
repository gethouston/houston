import {
  initialsFor,
  type KanbanItem,
  type KanbanPerson,
} from "@houston-ai/board";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useSession } from "../hooks/use-session";
import { distinctBoardPeople } from "../lib/mission-people";
import { isMultiplayer } from "../lib/org-roles";

interface MissionPersonFilterProps {
  /** The board items the person roster is drawn from (post agent-filter). */
  items: KanbanItem[];
  /** Currently selected person, or `null` for Everyone. */
  filterUserId: string | null;
  onFilterUserIdChange: (userId: string | null) => void;
  /** Compact layout: collapse the trigger to an icon-only face. */
  collapsed: boolean;
}

/** A compact avatar face used in the trigger and menu rows. */
function PersonFace({
  person,
}: {
  person: Pick<KanbanPerson, "label" | "imageUrl">;
}) {
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
 * Filter-by-person dropdown for Mission Control (hosted Teams only). Renders
 * nothing outside multiplayer or when signed out. Offers Everyone, the signed-in
 * user's own missions, then every other human on the visible board, each with
 * an avatar face. The gateway stamps attribution; this only narrows the view.
 */
export function MissionPersonFilter({
  items,
  filterUserId,
  onFilterUserIdChange,
  collapsed,
}: MissionPersonFilterProps) {
  const { t } = useTranslation("dashboard");
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const user = session?.user;

  if (!isMultiplayer(capabilities) || !user) return null;

  const meta = (user.user_metadata ?? {}) as {
    name?: string;
    full_name?: string;
    avatar_url?: string;
  };
  const selfName =
    meta.full_name ?? meta.name ?? user.email ?? user.id.slice(0, 8);
  const selfFace: Pick<KanbanPerson, "label" | "imageUrl"> = {
    label: selfName,
    imageUrl: meta.avatar_url,
  };
  const roster = distinctBoardPeople(items).filter((p) => p.id !== user.id);

  let activeFace: Pick<KanbanPerson, "label" | "imageUrl"> | null = null;
  let activeText = t("peopleFilter.everyone");
  if (filterUserId === user.id) {
    activeFace = selfFace;
    activeText = t("peopleFilter.mine");
  } else if (filterUserId) {
    const person = roster.find((p) => p.id === filterUserId);
    activeFace = person ?? null;
    activeText = person?.label ?? filterUserId.slice(0, 8);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={t("peopleFilter.label")}
          >
            {activeFace ? (
              <PersonFace person={activeFace} />
            ) : (
              <Users className="size-4" />
            )}
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="rounded-full gap-1.5"
            aria-label={t("peopleFilter.label")}
          >
            {activeFace ? (
              <PersonFace person={activeFace} />
            ) : (
              <Users className="size-4" />
            )}
            {activeText}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onFilterUserIdChange(null)}>
          {t("peopleFilter.everyone")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onFilterUserIdChange(user.id)}
          className="gap-2"
        >
          <PersonFace person={selfFace} />
          {t("peopleFilter.mine")}
        </DropdownMenuItem>
        {roster.map((person) => (
          <DropdownMenuItem
            key={person.id}
            onClick={() => onFilterUserIdChange(person.id)}
            className="gap-2"
          >
            <PersonFace person={person} />
            {person.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
